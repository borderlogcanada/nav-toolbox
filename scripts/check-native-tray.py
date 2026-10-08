"""Probe only Nav Toolbox's StatusNotifier activation and native X11 window.

Run with the desktop session's D-Bus/Display environment after launching 0.1.1.
This sends API activation events, not physical mouse clicks.
"""
import ctypes
import re
import subprocess
import time

from gi.repository import Gio, GLib

bus = Gio.bus_get_sync(Gio.BusType.SESSION, None)


def call(destination, path, interface, method, parameters):
    return bus.call_sync(destination, path, interface, method, parameters,
                         None, Gio.DBusCallFlags.NONE, 3000, None).unpack()


def prop(destination, path, interface, name):
    return call(destination, path, "org.freedesktop.DBus.Properties", "Get",
                GLib.Variant("(ss)", (interface, name)))[0]


items = prop("org.kde.StatusNotifierWatcher", "/StatusNotifierWatcher",
             "org.kde.StatusNotifierWatcher", "RegisteredStatusNotifierItems")
matches = []
for item in items:
    destination, _, suffix = item.partition("/")
    path = "/" + suffix if suffix else "/StatusNotifierItem"
    try:
        if prop(destination, path, "org.kde.StatusNotifierItem", "Id") == "nav-toolbox":
            matches.append((destination, path))
    except GLib.Error:
        continue
assert len(matches) == 1, f"Expected one updated Nav Toolbox tray instance, found {len(matches)}"
destination, path = matches[0]
assert prop(destination, path, "org.kde.StatusNotifierItem", "ItemIsMenu") is False
pid = call("org.freedesktop.DBus", "/org/freedesktop/DBus", "org.freedesktop.DBus",
           "GetConnectionUnixProcessID", GLib.Variant("(s)", (destination,)))[0]

x11 = ctypes.CDLL("libX11.so.6")
x11.XOpenDisplay.restype = ctypes.c_void_p
display = x11.XOpenDisplay(None)
assert display, "XWayland/X11 display is unavailable"
x11.XDefaultRootWindow.argtypes = [ctypes.c_void_p]
x11.XDefaultRootWindow.restype = ctypes.c_ulong
root = x11.XDefaultRootWindow(display)


class Attributes(ctypes.Structure):
    _fields_ = [(name, ctype) for name, ctype in [
        ("x", ctypes.c_int), ("y", ctypes.c_int), ("width", ctypes.c_int),
        ("height", ctypes.c_int), ("border_width", ctypes.c_int), ("depth", ctypes.c_int),
        ("visual", ctypes.c_void_p), ("root", ctypes.c_ulong), ("window_class", ctypes.c_int),
        ("bit_gravity", ctypes.c_int), ("win_gravity", ctypes.c_int), ("backing_store", ctypes.c_int),
        ("backing_planes", ctypes.c_ulong), ("backing_pixel", ctypes.c_ulong),
        ("save_under", ctypes.c_int), ("colormap", ctypes.c_ulong), ("map_installed", ctypes.c_int),
        ("map_state", ctypes.c_int), ("all_event_masks", ctypes.c_long),
        ("your_event_mask", ctypes.c_long), ("do_not_propagate_mask", ctypes.c_long),
        ("override_redirect", ctypes.c_int), ("screen", ctypes.c_void_p),
    ]]


x11.XGetWindowAttributes.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.POINTER(Attributes)]
x11.XTranslateCoordinates.argtypes = [ctypes.c_void_p, ctypes.c_ulong, ctypes.c_ulong,
                                     ctypes.c_int, ctypes.c_int, ctypes.POINTER(ctypes.c_int),
                                     ctypes.POINTER(ctypes.c_int), ctypes.POINTER(ctypes.c_ulong)]


def popup(title="Nav Toolbox Launcher"):
    listing = subprocess.run(["xprop", "-root", "_NET_CLIENT_LIST"], capture_output=True, text=True, check=True).stdout
    for item in re.findall(r"0x[0-9a-fA-F]+", listing):
        result = subprocess.run(["xprop", "-id", item, "_NET_WM_PID", "_NET_WM_NAME"], capture_output=True, text=True).stdout
        if re.search(rf"_NET_WM_PID.*= {pid}\b", result) and f'"{title}"' in result:
            attributes = Attributes()
            assert x11.XGetWindowAttributes(display, int(item, 16), ctypes.byref(attributes))
            x, y, child = ctypes.c_int(), ctypes.c_int(), ctypes.c_ulong()
            x11.XTranslateCoordinates(display, int(item, 16), root, 0, 0,
                                      ctypes.byref(x), ctypes.byref(y), ctypes.byref(child))
            return {"visible": attributes.map_state == 2, "x": x.value, "y": y.value,
                    "width": attributes.width, "height": attributes.height}
    return {"visible": False}


def activate(x, y):
    call(destination, path, "org.kde.StatusNotifierItem", "Activate", GLib.Variant("(ii)", (x, y)))


def wait_visible(expected, title="Nav Toolbox Launcher"):
    deadline = time.monotonic() + 4
    while time.monotonic() < deadline:
        result = popup(title)
        if result["visible"] == expected:
            return result
        time.sleep(0.05)
    raise AssertionError(f"Expected launcher visible={expected}, got {popup(title)}")


activate(1200, 16)
shown = wait_visible(True)
assert shown["width"] > 0 and shown["height"] > 0
assert shown["x"] >= 0 and shown["y"] >= 0
activate(1200, 16)
wait_visible(False)
time.sleep(0.25)
activate(-1, -1)
fallback = wait_visible(True)
second_launch = subprocess.run(["/usr/bin/nav-toolbox"], capture_output=True, timeout=6)
assert second_launch.returncode == 0, "Second desktop launch did not reuse the running app"
manager = wait_visible(True, "Nav Toolbox")
wait_visible(False)
print({"second_launch_reused_instance": True, "manager_reopened": manager, "registered": True, "item_is_menu": False, "activation_opened": shown,
       "second_activation_closed": True, "unknown_position_opened": fallback})
