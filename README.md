# TTS Studio – Text to Speech Web App

Ứng dụng web chuyển văn bản thành giọng nói sử dụng **Microsoft Edge Neural Voices** (edge-tts) + **Flask**.  
Hỗ trợ 400+ giọng đọc, bao gồm tiếng Việt và hơn 40 ngôn ngữ.

---

## Cài đặt

### 1. Yêu cầu
- Python 3.8 trở lên  
- Kết nối Internet (edge-tts gọi API của Microsoft)

### 2. Cài dependencies

```bash
pip install -r requirements.txt
```

### 3. Chạy ứng dụng

```bash
python app.py
```

Mở trình duyệt và truy cập: **http://127.0.0.1:5000**

---

## Cấu trúc project

```
├── app.py                  # Flask backend – routes & TTS logic
├── requirements.txt
├── README.md
├── templates/
│   └── index.html          # Giao diện người dùng
└── static/
    ├── css/
    │   └── style.css       # Toàn bộ stylesheet
    ├── js/
    │   └── main.js         # Frontend logic (load voices, generate, download)
    └── generated/          # File .mp3 tạm thời (tự xoá sau 1 giờ)
```

---

## Tính năng

- **400+ neural voices** từ Microsoft Edge TTS
- Tiếng Việt: `vi-VN-HoaiMyNeural` (nữ) và `vi-VN-NamMinhNeural` (nam)
- Điều chỉnh tốc độ đọc từ −50% đến +100%
- Phát audio trực tiếp trên trình duyệt
- Tải file MP3 về máy
- Tự động xoá file cũ sau 1 giờ
- Phím tắt `Ctrl+Enter` để tạo nhanh

---

## Tuỳ chỉnh

### Đổi giọng mặc định
Trong `app.py`, dòng:
```python
voice = data.get("voice", "vi-VN-HoaiMyNeural")
```
Thay `vi-VN-HoaiMyNeural` bằng tên giọng bạn muốn.

### Xem danh sách tất cả giọng đọc
```bash
python -c "import asyncio, edge_tts; voices = asyncio.run(edge_tts.list_voices()); [print(v['ShortName']) for v in voices]"
```

### Đổi sang thư viện TTS khác
Thay hàm `synthesize()` trong `app.py`. Chỉ cần output ra file `.mp3` với đường dẫn `filepath`.

### Thay đổi giới hạn ký tự
`MAX_TEXT_LENGTH = 5000` ở đầu `app.py`.

---

## Lưu ý

- Ứng dụng yêu cầu Internet để gọi API tổng hợp giọng của Microsoft.
- File audio được lưu tạm trong `static/generated/` và tự động xoá sau 1 giờ.
- Không phù hợp cho môi trường production nếu cần xử lý lượng lớn request đồng thời (sử dụng gunicorn + workers trong trường hợp đó).
