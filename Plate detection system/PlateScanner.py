import argparse
import importlib.util
import os
import sys
from collections import Counter, deque
 
import cv2
import numpy as np
import pytesseract
 
pytesseract.pytesseract.tesseract_cmd = r"D:\computer\tesseract.exe"
 
# ---- Connect to the database file (PlateDetect main.py) -----------------
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DB_MODULE_PATH = os.path.join(BASE_DIR, "PlateDetect main.py")
 
if not os.path.exists(DB_MODULE_PATH):
    sys.exit(f"Can't find 'PlateDetect main.py' next to this file:\n{BASE_DIR}")
 
_spec = importlib.util.spec_from_file_location("plate_db", DB_MODULE_PATH)
plate_db = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(plate_db)   # does NOT open the window
 
# ---- Settings -----------------------------------------------------------
GREEN = (0, 200, 0)
RED = (0, 0, 220)
YELLOW = (0, 220, 220)
 
CONFIRM_FRAMES = 3      # same reading needed this many times...
HISTORY_SIZE = 10       # ...within the last N frames
MIN_PLATE_LEN = 5       # ignore very short OCR junk
OCR_CONFIG = ("--psm 7 -c tessedit_char_whitelist="
              "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789")
 
 
# ----------------------------- Detection ---------------------------------
def find_plate_candidates(frame):
    """Return a list of (bounding_box, cropped_gray) for plate-like rectangles."""
    gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
    blur = cv2.bilateralFilter(gray, 11, 17, 17)
    edges = cv2.Canny(blur, 30, 200)
 
    contours, _ = cv2.findContours(edges, cv2.RETR_TREE, cv2.CHAIN_APPROX_SIMPLE)
    contours = sorted(contours, key=cv2.contourArea, reverse=True)[:15]
 
    candidates = []
    for c in contours:
        peri = cv2.arcLength(c, True)
        approx = cv2.approxPolyDP(c, 0.018 * peri, True)
        if len(approx) != 4:
            continue
        x, y, w, h = cv2.boundingRect(approx)
        if h == 0 or w < 80:
            continue
        if 1.8 <= w / h <= 6.0:  # plates are wide rectangles
            candidates.append(((x, y, w, h), gray[y:y + h, x:x + w]))
    return candidates
 
 
def read_plate_text(crop):
    """Preprocess a cropped plate and run OCR. Returns normalized text."""
    crop = cv2.resize(crop, None, fx=2, fy=2, interpolation=cv2.INTER_CUBIC)
    crop = cv2.GaussianBlur(crop, (3, 3), 0)
    _, thresh = cv2.threshold(crop, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
    if np.mean(thresh) < 127:       # Tesseract wants dark text on light bg
        thresh = cv2.bitwise_not(thresh)
    thresh = cv2.copyMakeBorder(thresh, 10, 10, 10, 10,
                                cv2.BORDER_CONSTANT, value=255)
    text = pytesseract.image_to_string(thresh, config=OCR_CONFIG)
    return plate_db.normalize(text)
 
 
def detect_plate(frame):
    """Return (box, text) for the first candidate with a plausible reading."""
    for box, crop in find_plate_candidates(frame):
        text = read_plate_text(crop)
        if len(text) >= MIN_PLATE_LEN:
            return box, text
    return None, None
 
 
# ------------------------------ Display ----------------------------------
def draw_status(frame, box, plate, authorized, confirmed):
    if box is not None:
        x, y, w, h = box
        color = (GREEN if authorized else RED) if confirmed else YELLOW
        cv2.rectangle(frame, (x, y), (x + w, y + h), color, 3)
 
    if confirmed and plate:
        color = GREEN if authorized else RED
        msg = f"{plate}  -  " + ("AUTHORIZED: GO THROUGH" if authorized
                                 else "DENIED: DO NOT ENTER")
    else:
        color = (80, 80, 80)
        msg = "Scanning..."
    cv2.rectangle(frame, (0, 0), (frame.shape[1], 50), color, -1)
    cv2.putText(frame, msg, (10, 34), cv2.FONT_HERSHEY_SIMPLEX,
                0.9, (255, 255, 255), 2)
 
 
# ------------------------------- Main ------------------------------------
def scan(source):
    src = int(source) if str(source).isdigit() else source
    cap = cv2.VideoCapture(src)
    if not cap.isOpened():
        sys.exit(f"Could not open source: {source}")
 
    history = deque(maxlen=HISTORY_SIZE)
 
    while True:
        ok, frame = cap.read()
        if not ok:
            break
 
        box, text = detect_plate(frame)
        if box is not None:
            x, y, w, h = box
            cv2.imshow("OCR Crop", frame[y:y + h, x:x + w])
            
        history.append(text)
 
        # Majority vote across recent frames to filter out OCR noise
        counts = Counter(t for t in history if t)
        confirmed_plate = None
        if counts:
            best, n = counts.most_common(1)[0]
            if n >= CONFIRM_FRAMES:
                confirmed_plate = best
 
        # Live lookup in the shared database
        authorized = bool(confirmed_plate) and plate_db.plate_exists(confirmed_plate)
        draw_status(frame, box, confirmed_plate, authorized,
                    confirmed=confirmed_plate is not None)
 
        cv2.imshow("Plate Scanner", frame)
        key = cv2.waitKey(1) & 0xFF
        if key == ord("q"):
            break
        if key == ord("r") and confirmed_plate:
            if plate_db.add_plate(confirmed_plate):
                print(f"Registered: {confirmed_plate}")
 
    cap.release()
    cv2.destroyAllWindows()
 
 
if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Plate scanner")
    parser.add_argument("--source", default="0",
                        help="camera index, video path, or image path")
    scan(parser.parse_args().source)