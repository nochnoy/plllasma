#!/usr/bin/env /usr/local/bin/venv/bin/python3
from flask import Flask, request, send_file, jsonify
import requests
import io
from urllib.parse import urljoin

app = Flask(__name__)

# URL превью YouTube (в порядке приоритета)
PREVIEW_URLS = [
    "maxresdefault.jpg",
    "hqdefault.jpg",
    "sddefault.jpg",
    "mqdefault.jpg",
    "default.jpg"
]

def get_youtube_preview(video_id):
    """Получить превью YouTube видео напрямую"""
    base_url = f"https://img.youtube.com/vi/{video_id}/"

    for preview_type in PREVIEW_URLS:
        url = urljoin(base_url, preview_type)
        try:
            response = requests.get(url, timeout=10, stream=True)
            if response.status_code == 200:
                # Проверяем что это валидное изображение
                content = response.content
                if is_valid_image_content(content):
                    return True, content
        except requests.RequestException:
            continue

    return False, None

def is_valid_image_content(content):
    """Проверить валидность изображения по содержимому"""
    if len(content) < 1024:
        return False

    # Проверяем сигнатуру JPEG
    if content[:3] != b'\xff\xd8\xff':
        return False

    # Дополнительная проверка на текстовые ошибки
    content_lower = content.lower()
    if b'html' in content_lower or b'error' in content_lower:
        return False

    return True

@app.route('/api/preview/<video_id>', methods=['GET'])
def get_preview(video_id):
    """Получить превью YouTube видео"""
    success, image_content = get_youtube_preview(video_id)

    if success and image_content:
        return send_file(
            io.BytesIO(image_content), 
            mimetype='image/jpeg'
        )
    else:
        return jsonify({"error": "Preview not found", "video_id": video_id}), 404

@app.route('/')
def index():
    """Главная страница с информацией"""
    return """
    <h1>YouTube Preview API</h1>
    <p>Простой прокси для получения превью YouTube видео</p>
    <p>Endpoint:</p>
    <ul>
        <li>GET <code>/api/preview/&lt;video_id&gt;</code> - получить превью</li>
    </ul>
    <p>Пример: <a href="/api/preview/dQw4w9WgXcQ">/api/preview/dQw4w9WgXcQ</a></p>
    <p><small>Превью загружаются напрямую с YouTube без кэширования</small></p>
    """

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
