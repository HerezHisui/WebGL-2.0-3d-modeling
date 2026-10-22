# Plate Detection System

A license plate authorization system built with Python and OpenCV.

- **PlateDetect main.py**: the database app (a window where you register plates and owner names).
- **PlateScanner.py**: the live scanner. It reads plates from a camera and shows **green** (authorized) if the plate is in the database, or **red** (denied) if it isn't.

Both programs share one database file, `plates.db`.

---

## 1. What you need to install

| Software | Needed for |
|----------|-----------|
| Python 3 | Running everything |
| Python packages (OpenCV, pytesseract, NumPy) | Detecting and reading plates |
| Tesseract OCR | Reading the characters on the plate |
| DroidCam or IP Webcam (optional) | Using your phone as the camera |

### Step 1: Install Python

1. Download Python from https://www.python.org/downloads/
2. Run the installer and **tick "Add Python to PATH"** before clicking Install.
3. Check it works by opening a terminal (Command Prompt, PowerShell, or the VS Code terminal) and running:
   ```
   python --version
   ```

### Step 2: Install the Python packages

In the terminal, run:

```
pip install opencv-python pytesseract numpy
```

The database app uses only built-in Python modules (tkinter and sqlite3), so it needs nothing extra.

### Step 3: Install Tesseract OCR (Windows)

`pip install pytesseract` only installs the Python wrapper. You must install the Tesseract program itself.

1. Download the Windows installer from the UB Mannheim page:
   https://github.com/UB-Mannheim/tesseract/wiki
2. Run the installer with the default settings. It installs to:
   ```
   C:\Program Files\Tesseract-OCR\tesseract.exe
   ```
3. Check it works by opening a **new** terminal and running:
   ```
   tesseract --version
   ```
   If it prints a version number, you're done. If it says the command isn't recognized, continue to Step 4.

**Linux:** `sudo apt install tesseract-ocr`
**macOS:** `brew install tesseract`

### Step 4: Tell the scanner where Tesseract is (Windows)

Open `PlateScanner.py` and find this line near the top:

```python
# pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
```

Remove the `# ` at the start so it becomes:

```python
pytesseract.pytesseract.tesseract_cmd = r"C:\Program Files\Tesseract-OCR\tesseract.exe"
```

If you installed Tesseract in a different folder, replace the path with the real location of `tesseract.exe`. Keep the `r` before the quotes.

---

## 2. Folder setup

Put these files together in **one folder**:

```
Plate detection system/
├── PlateDetect main.py     (database app, keep this exact name)
├── PlateScanner.py         (scanner)
├── plates.db               (created automatically)
└── settings.json           (created automatically, remembers dark/light mode)
```

`PlateScanner.py` imports `PlateDetect main.py`, so don't rename it or move it to another folder.

---

## 3. How to use

### Register plates (database app)

1. Run the database app:
   ```
   python "PlateDetect main.py"
   ```
   (or double-click the file, or the `.exe` if you built one).
2. Type the **plate number** and optionally the **owner name**, then press Enter or click **Add**.
3. Use **Edit name** (or double-click a row) to change an owner name, **Remove selected** to delete plates, and the search box to find plates or names.
4. Use the button in the top-right corner to switch between **Dark mode** and **Light mode**.

### Scan plates (scanner)

1. Run the scanner:
   ```
   python PlateScanner.py
   ```
2. Point the camera at a plate:
   - **Yellow box**: a plate-like shape was found, still reading it.
   - **Green box and banner** (`AUTHORIZED: GO THROUGH`): the plate is in the database.
   - **Red box and banner** (`DENIED: DO NOT ENTER`): the plate is not in the database.
3. Keys while scanning:
   - `q` quits.
   - `r` registers the plate currently on screen.

You can add plates in the database app while the scanner is running. The scanner picks them up right away.

### Other camera sources

```
python PlateScanner.py --source 1                          (second camera / DroidCam Client)
python PlateScanner.py --source car.mp4                    (video file or image)
python PlateScanner.py --source http://PHONE_IP:4747/video (phone over Wi-Fi)
```

---

## 4. Using your phone as the camera

1. Install **DroidCam** (or **IP Webcam**) on your phone.
2. Put the phone and PC on the **same Wi-Fi**.
3. Start the server in the phone app and note the IP address it shows.
4. Either use the DroidCam Client on the PC and run the scanner with `--source 1`, or run the scanner with the phone's URL as shown above.

Tips for better results:
- Use **720p** resolution and a high quality setting. Sharp characters matter more than smooth video.
- Use good lighting and avoid glare on the plate.
- Turn off digital zoom and stabilization if possible.

---

## 5. Making the database app an .exe (optional)

Run these in the terminal, in your project folder:

```
pip install pyinstaller
pyinstaller --onefile --windowed --name PlateDatabase "PlateDetect main.py"
```

The exe appears in the `dist` folder. Copy `PlateDatabase.exe` into the same folder as `PlateScanner.py`.

Notes:
- Keep `PlateDetect main.py`, `PlateScanner.py`, the exe and `plates.db` together in one folder so both programs use the same database.
- Rebuild the exe after every change to the `.py` file.
- Windows Defender may flag unsigned exe files. This is usually a false positive.

---

## 6. Troubleshooting

| Problem | Fix |
|---------|-----|
| `TesseractNotFoundError` | Install Tesseract and set the `tesseract_cmd` path (Steps 3 and 4). |
| `python` is not recognized | Reinstall Python and tick "Add Python to PATH". |
| `Could not open source` | Try `--source 1` or `--source 2`, and close other apps using the camera. |
| Scanner can't find `PlateDetect main.py` | Keep both files in the same folder with the exact original name. |
| Registered plate shows red | The scanner may be reading a character wrong (for example `0` vs `O`). Compare the text in the banner with your database, or press `r` to register what the scanner sees. |
| Plate not detected | Improve lighting, hold the plate flatter to the camera, or adjust the Canny thresholds in `find_plate_candidates()`. |
| Added plates in the exe don't work in the scanner | There may be two `plates.db` files. Keep the exe and scanner in the same folder. |
| Camera feed is laggy | Lower the phone's resolution or bitrate. |
