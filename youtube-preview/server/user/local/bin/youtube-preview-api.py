#!/usr/bin/env /usr/local/bin/venv/bin/python3
from flask import Flask, request, send_file, jsonify
import os
import requests
from urllib.parse import urljoin

app = Flask(__name__)

# Пути
PREVIEWS_DIR = "/usr/local/bin/previews"

# URL превью YouTube (в порядке приоритета)
PREVIEW_URLS = [
    "maxresdefault.jpg",
    "hqdefault.jpg",
    "sddefault.jpg",
    "mqdefault.jpg",
    "default.jpg"
]

def download_youtube_preview(video_id):
    """Скачать превью YouTube видео"""
    base_url = f"https://img.youtube.com/vi/{video_id}/"

    for preview_type in PREVIEW_URLS:
        url = urljoin(base_url, preview_type)
        try:
            response = requests.get(url, timeout=10, stream=True)
            if response.status_code == 200:
                # Сохраняем временный файл для проверки
                temp_path = os.path.join(PREVIEWS_DIR, f"{video_id}.tmp")
                with open(temp_path, 'wb') as f:
                    for chunk in response.iter_content(chunk_size=8192):
                        f.write(chunk)

                # Проверяем что это валидное изображение
                if is_valid_image(temp_path):
                    final_path = os.path.join(PREVIEWS_DIR, f"{video_id}.jpg")
                    os.rename(temp_path, final_path)
                    return True, final_path
                else:
                    os.remove(temp_path)

        except requests.RequestException:
            continue

    return False, None

def is_valid_image(file_path):
    """Проверить валидность изображения"""
    if not os.path.exists(file_path) or os.path.getsize(file_path) < 1024:
        return False

    # Проверяем сигнатуру JPEG
    try:
        with open(file_path, 'rb') as f:
            header = f.read(3)
            return header == b'\xff\xd8\xff'
    except:
        return False

    # Дополнительная проверка на текстовые ошибки
    try:
        with open(file_path, 'rb') as f:
            content = f.read(100)
            if b'html' in content.lower() or b'error' in content.lower():
                return False
    except:
        pass

    return True

def delete_preview_file(video_id):
    """Удалить файл превью"""
    preview_path = os.path.join(PREVIEWS_DIR, f"{video_id}.jpg")
    if os.path.exists(preview_path):
        os.remove(preview_path)
        return True
    return False

@app.route('/api/preview/<video_id>', methods=['GET'])
def get_preview(video_id):
    """Скачать или создать превью"""
    preview_path = os.path.join(PREVIEWS_DIR, f"{video_id}.jpg")

    # Если файл уже существует - отдаем его
    if os.path.exists(preview_path):
        return send_file(preview_path, mimetype='image/jpeg')

    # Если нет - создаем
    success, file_path = download_youtube_preview(video_id)

    if success and file_path:
        return send_file(file_path, mimetype='image/jpeg')
    else:
        return jsonify({"error": "Failed to create preview", "video_id": video_id}), 500

@app.route('/api/preview/<video_id>', methods=['DELETE'])
def delete_preview(video_id):
    """Удалить превью"""
    success = delete_preview_file(video_id)

    if success:
        return jsonify({"status": "deleted", "video_id": video_id})
    else:
        return jsonify({"error": "Preview not found", "video_id": video_id}), 404

@app.route('/api/preview/<video_id>/status', methods=['GET'])
def check_preview(video_id):
    """Проверить статус превью"""
    preview_path = os.path.join(PREVIEWS_DIR, f"{video_id}.jpg")

    if os.path.exists(preview_path):
        size = os.path.getsize(preview_path)
        return jsonify({
            "exists": True,
            "video_id": video_id,
            "size_kb": size // 1024,
            "path": preview_path
        })
    else:
        return jsonify({"exists": False, "video_id": video_id}), 404

@app.route('/')
def index():
    """Главная страница с информацией"""
    return """
    <h1>YouTube Preview API</h1>
    <p>Endpoints:</p>
    <ul>
        <li>GET <code>/api/preview/&lt;video_id&gt;</code> - получить превью</li>
        <li>DELETE <code>/api/preview/&lt;video_id&gt;</code> - удалить превью</li>
        <li>GET <code>/api/preview/&lt;video_id&gt;/status</code> - проверить статус</li>
    </ul>
    <p>Пример: <a href="/api/preview/dQw4w9WgXcQ">/api/preview/dQw4w9WgXcQ</a></p>
    """

if __name__ == '__main__':
    # Создаем папку если не существует
    os.makedirs(PREVIEWS_DIR, exist_ok=True)
    app.run(host='0.0.0.0', port=5000, debug=False)
