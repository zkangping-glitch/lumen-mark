import ctypes
import sys
import time
from ctypes import wintypes

from PIL import Image, ImageGrab

try:
    ctypes.windll.shcore.SetProcessDpiAwareness(2)
except Exception:
    pass

user32 = ctypes.windll.user32
gdi32 = ctypes.windll.gdi32
EnumWindowsProc = ctypes.WINFUNCTYPE(wintypes.BOOL, wintypes.HWND, wintypes.LPARAM)


def list_windows():
    out = []

    def cb(hwnd, _lparam):
        if not user32.IsWindowVisible(hwnd):
            return True
        length = user32.GetWindowTextLengthW(hwnd)
        if length <= 0:
            return True
        buf = ctypes.create_unicode_buffer(length + 1)
        user32.GetWindowTextW(hwnd, buf, length + 1)
        out.append((hwnd, buf.value))
        return True

    user32.EnumWindows(EnumWindowsProc(cb), 0)
    return out


def window_rect(hwnd):
    class RECT(ctypes.Structure):
        _fields_ = [
            ("left", wintypes.LONG),
            ("top", wintypes.LONG),
            ("right", wintypes.LONG),
            ("bottom", wintypes.LONG),
        ]

    rect = RECT()
    got = ctypes.windll.dwmapi.DwmGetWindowAttribute(hwnd, 9, ctypes.byref(rect), ctypes.sizeof(rect))
    if got == 0 and rect.right > rect.left and rect.bottom > rect.top:
        return rect.left, rect.top, rect.right, rect.bottom
    r = wintypes.RECT()
    user32.GetWindowRect(hwnd, ctypes.byref(r))
    return r.left, r.top, r.right, r.bottom


def print_window(hwnd, out_path):
    left, top, right, bottom = window_rect(hwnd)
    width, height = right - left, bottom - top
    if width <= 0 or height <= 0:
        return False

    hdc_screen = user32.GetDC(0)
    hdc_mem = gdi32.CreateCompatibleDC(hdc_screen)
    hbmp = gdi32.CreateCompatibleBitmap(hdc_screen, width, height)
    gdi32.SelectObject(hdc_mem, hbmp)

    ok = user32.PrintWindow(hwnd, hdc_mem, 2)  # PW_RENDERFULLCONTENT
    if not ok:
        gdi32.DeleteObject(hbmp)
        gdi32.DeleteDC(hdc_mem)
        user32.ReleaseDC(0, hdc_screen)
        return False

    class BITMAPINFOHEADER(ctypes.Structure):
        _fields_ = [
            ("biSize", wintypes.DWORD),
            ("biWidth", wintypes.LONG),
            ("biHeight", wintypes.LONG),
            ("biPlanes", wintypes.WORD),
            ("biBitCount", wintypes.WORD),
            ("biCompression", wintypes.DWORD),
            ("biSizeImage", wintypes.DWORD),
            ("biXPelsPerMeter", wintypes.LONG),
            ("biYPelsPerMeter", wintypes.LONG),
            ("biClrUsed", wintypes.DWORD),
            ("biClrImportant", wintypes.DWORD),
        ]

    bmi = BITMAPINFOHEADER()
    bmi.biSize = ctypes.sizeof(BITMAPINFOHEADER)
    bmi.biWidth = width
    bmi.biHeight = -height  # top-down
    bmi.biPlanes = 1
    bmi.biBitCount = 32
    bmi.biCompression = 0

    buf = ctypes.create_string_buffer(width * height * 4)
    gdi32.GetDIBits(hdc_mem, hbmp, 0, height, buf, ctypes.byref(bmi), 0)

    img = Image.frombuffer("RGBA", (width, height), buf.raw, "raw", "BGRA", 0, 1).convert("RGB")
    img.save(out_path)

    gdi32.DeleteObject(hbmp)
    gdi32.DeleteDC(hdc_mem)
    user32.ReleaseDC(0, hdc_screen)
    return True


def main():
    out_path = sys.argv[1] if len(sys.argv) > 1 else r"D:\DSH_WorkSpace\_tmp\shot.png"
    match = sys.argv[2] if len(sys.argv) > 2 else "Lumen Mark"

    target = None
    target_title = ""
    for hwnd, title in list_windows():
        if match.lower() in title.lower():
            target = hwnd
            target_title = title
            break

    if target is None:
        print("NO WINDOW FOUND for", match)
        for hwnd, title in list_windows():
            print("  window:", hwnd, repr(title))
        return 1

    user32.ShowWindow(target, 9)  # SW_RESTORE
    try:
        user32.SetForegroundWindow(target)
    except Exception:
        pass
    try:
        user32.SetCursorPos(4, 4)
    except Exception:
        pass
    time.sleep(0.6)

    if print_window(target, out_path):
        print("saved (printwindow)", out_path, window_rect(target))
    else:
        left, top, right, bottom = window_rect(target)
        ImageGrab.grab(bbox=(left, top, right, bottom)).save(out_path)
        print("saved (screen grab)", out_path)

    full_path = out_path.replace(".png", "-full.png")
    ImageGrab.grab().save(full_path)
    print("saved", full_path)
    return 0


if __name__ == "__main__":
    sys.exit(main())
