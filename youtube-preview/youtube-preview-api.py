#!/usr/bin/env /usr/local/bin/venv/bin/python3
from flask import Flask, request, send_file, jsonify
import requests
import io
import re
import json
import math
import sys
from urllib.parse import urljoin
from PIL import Image, ImageDraw

app = Flask(__name__)

# Функция для логирования в stderr (чтобы попадало в journalctl)
def log(message):
    print(message, file=sys.stderr, flush=True)

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
    """
    Получить превью YouTube видео.
    Приоритет: Storyboard (HQ → LQ) → Regular preview (maxres → hq → sd → mq → default)
    """
    # Сначала пытаемся получить storyboard
    storyboard_result = try_get_storyboard(video_id)
    if storyboard_result:
        return storyboard_result
    
    # Если storyboard не получился, возвращаем обычное превью
    success, image_content = get_youtube_preview(video_id)
    if success and image_content:
        return send_file(
            io.BytesIO(image_content), 
            mimetype='image/jpeg'
        )
    else:
        return jsonify({"error": "Preview not found", "video_id": video_id}), 404

def try_get_storyboard(video_id):
    """
    Попытаться получить storyboard для видео.
    Возвращает Flask Response если успешно, None если не получилось.
    """
    try:
        # Получаем информацию о storyboard
        html = get_youtube_page(video_id)
        if not html:
            return None
        
        player_response = extract_player_response(html)
        if not player_response:
            return None
        
        spec = parse_storyboard_spec(player_response)
        duration = get_video_duration(player_response)
        
        if not spec or not duration:
            return None
        
        # Пытаемся получить storyboard (HQ → LQ)
        qualities = [
            ('hq', True),
            ('lq', False)
        ]
        
        for quality_name, hq in qualities:
            storyboard_urls = generate_storyboard_urls(spec, hq, duration)
            
            if not storyboard_urls:
                continue
            
            # Берем первое изображение (индекс 0)
            first_url = storyboard_urls[0]
            
            try:
                response = requests.get(first_url, timeout=10)
                
                if response.status_code == 200 and len(response.content) > 1024:
                    # Проверяем формат (JPEG или WebP)
                    is_jpeg = response.content[:3] == b'\xff\xd8\xff'
                    is_webp = response.content[:4] == b'RIFF' and response.content[8:12] == b'WEBP'
                    
                    if is_jpeg:
                        # Открываем JPEG и добавляем линии
                        img = Image.open(io.BytesIO(response.content))
                        img = add_grid_lines(img, hq)
                        
                        # Сохраняем обратно в JPEG
                        output = io.BytesIO()
                        img.save(output, format='JPEG', quality=90)
                        output.seek(0)
                        
                        return send_file(
                            output,
                            mimetype='image/jpeg'
                        )
                    elif is_webp:
                        # Конвертируем WebP в JPEG
                        img = Image.open(io.BytesIO(response.content))
                        
                        # Конвертируем в RGB если нужно
                        if img.mode in ('RGBA', 'LA', 'P'):
                            background = Image.new('RGB', img.size, (255, 255, 255))
                            if img.mode == 'P':
                                img = img.convert('RGBA')
                            background.paste(img, mask=img.split()[-1] if img.mode == 'RGBA' else None)
                            img = background
                        elif img.mode != 'RGB':
                            img = img.convert('RGB')
                        
                        # Добавляем линии между кадрами
                        img = add_grid_lines(img, hq)
                        
                        # Сохраняем как JPEG
                        output = io.BytesIO()
                        img.save(output, format='JPEG', quality=90)
                        output.seek(0)
                        
                        return send_file(
                            output,
                            mimetype='image/jpeg'
                        )
            except Exception:
                continue
        
        return None
    except Exception:
        return None

def add_grid_lines(img, is_hq=True):
    """
    Раздвигает кадры в storyboard изображении, добавляя промежутки между ними.
    Проверяет что размер изображения стандартный, иначе возвращает оригинал без изменений.
    
    :param img: PIL Image объект
    :param is_hq: True для HQ (5x5), False для LQ (10x10)
    :return: PIL Image с раздвинутыми кадрами или оригинал
    """
    width, height = img.size
    
    # Определяем размер сетки
    grid_cols = 5 if is_hq else 10
    grid_rows = 5 if is_hq else 10
    
    # Вычисляем размер одного кадра
    frame_width = width // grid_cols
    frame_height = height // grid_rows
    
    # ПРОВЕРКА: размеры должны делиться нацело
    # Если нет - возвращаем оригинал без изменений
    if width % grid_cols != 0 or height % grid_rows != 0:
        log(f"WARNING: Non-standard storyboard size {width}x{height}, skipping grid lines")
        return img
    
    # ПРОВЕРКА: ожидаемые размеры кадров
    # Для HQ обычно 160x90 или близкие значения
    # Для LQ обычно 80x45 или близкие значения
    expected_frame_width = 160 if is_hq else 80
    expected_frame_height = 90 if is_hq else 45
    
    # Допускаем отклонение ±50% от стандартных размеров
    if not (expected_frame_width * 0.5 <= frame_width <= expected_frame_width * 1.5) or \
       not (expected_frame_height * 0.5 <= frame_height <= expected_frame_height * 1.5):
        log(f"WARNING: Unexpected frame size {frame_width}x{frame_height}, skipping grid lines")
        return img
    
    # Параметры промежутков
    gap_color = (215, 202, 187)  # #D7CABB
    gap_size = 4
    
    # Вычисляем размер нового изображения
    new_width = width + gap_size * (grid_cols - 1)
    new_height = height + gap_size * (grid_rows - 1)
    
    # Создаем новое изображение с фоном нужного цвета
    new_img = Image.new('RGB', (new_width, new_height), gap_color)
    
    # Копируем каждый кадр в новое изображение с промежутками
    for row in range(grid_rows):
        for col in range(grid_cols):
            # Координаты кадра в исходном изображении
            src_x = col * frame_width
            src_y = row * frame_height
            
            # Координаты в новом изображении (с учетом промежутков)
            dst_x = col * (frame_width + gap_size)
            dst_y = row * (frame_height + gap_size)
            
            # Вырезаем кадр из исходного изображения
            frame = img.crop((src_x, src_y, src_x + frame_width, src_y + frame_height))
            
            # Вставляем кадр в новое изображение
            new_img.paste(frame, (dst_x, dst_y))
    
    return new_img

def get_youtube_page(video_id):
    """Получить HTML страницу YouTube видео"""
    url = f"https://www.youtube.com/watch?v={video_id}"
    headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
    }
    
    try:
        response = requests.get(url, headers=headers, timeout=15)
        if response.status_code == 200:
            return response.text
        return None
    except requests.RequestException as e:
        print(f"Error fetching YouTube page: {e}")
        return None

def extract_player_response(html):
    """Извлечь ytInitialPlayerResponse из HTML страницы"""
    if not html:
        return None
    
    # Ищем ytInitialPlayerResponse в HTML
    patterns = [
        r'var ytInitialPlayerResponse\s*=\s*({.+?});',
        r'ytInitialPlayerResponse\s*=\s*({.+?});',
        r'ytInitialPlayerResponse"\s*:\s*({.+?}),',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, html, re.DOTALL)
        if match:
            try:
                player_response = json.loads(match.group(1))
                return player_response
            except json.JSONDecodeError:
                continue
    
    return None

def parse_storyboard_spec(player_response):
    """Извлечь spec из playerResponse"""
    try:
        spec = player_response.get('storyboards', {}).get('playerStoryboardSpecRenderer', {}).get('spec')
        return spec
    except (AttributeError, KeyError):
        return None

def get_video_duration(player_response):
    """Получить длительность видео в секундах"""
    try:
        duration = player_response.get('videoDetails', {}).get('lengthSeconds')
        return int(duration) if duration else None
    except (AttributeError, KeyError, ValueError):
        return None

def generate_storyboard_urls(spec, hq=True, seconds=None):
    """
    Генерировать URLs storyboard изображений
    
    :param spec: YouTube playerStoryboardSpecRenderer.spec
    :param hq: High quality (True) или low quality (False)
    :param seconds: Длительность видео в секундах
    :return: Список URLs storyboard изображений
    """
    if not spec or not seconds:
        return []
    
    spec_parts = spec.split('|')
    base_url_hq = spec_parts[0].split('$')[0] + '2/'
    base_url_lq = spec_parts[0].split('$')[0] + '1/'
    sgp_part = spec_parts[0].split('$N')[1]
    
    # Определяем sigh части
    if len(spec_parts) == 3:
        sigh_part_hq = spec_parts[2].split('M#')[1]
        sigh_part_lq = spec_parts[1].split('M#')[1]
    elif len(spec_parts) == 2:
        sigh_part_hq = spec_parts[1].split('t#')[1] if 't#' in spec_parts[1] else spec_parts[1].split('M#')[1]
        sigh_part_lq = sigh_part_hq  # Используем HQ для LQ как fallback
    else:
        sigh_part_hq = spec_parts[3].split('M#')[1]
        sigh_part_lq = spec_parts[2].split('M#')[1]
    
    # Вычисляем количество изображений
    division = 25 if hq else 100
    
    if seconds < 250:
        amount_of_boards = math.ceil((seconds / 2) / division)
    elif 250 <= seconds < 1000:
        amount_of_boards = math.ceil((seconds / 4) / division)
    else:
        amount_of_boards = math.ceil((seconds / 10) / division)
    
    # Генерируем URLs
    storyboard_urls = []
    if hq:
        for i in range(amount_of_boards):
            url = f"{base_url_hq}M{i}{sgp_part}&sigh={sigh_part_hq}"
            storyboard_urls.append(url)
    else:
        for i in range(amount_of_boards):
            url = f"{base_url_lq}M{i}{sgp_part}&sigh={sigh_part_lq}"
            storyboard_urls.append(url)
    
    return storyboard_urls

@app.route('/api/storyboard/<video_id>', methods=['GET'])
def get_storyboard(video_id):
    """
    Получить информацию о storyboard для YouTube видео
    
    Query параметры:
    - quality: 'hq' (default) или 'lq'
    - format: 'json' (default) - список URLs, 'spec' - только spec и duration
    """
    quality = request.args.get('quality', 'hq').lower()
    format_type = request.args.get('format', 'json').lower()
    hq = quality == 'hq'
    
    # Получаем страницу YouTube
    html = get_youtube_page(video_id)
    if not html:
        return jsonify({
            "error": "Failed to fetch YouTube page",
            "video_id": video_id
        }), 404
    
    # Извлекаем playerResponse
    player_response = extract_player_response(html)
    if not player_response:
        return jsonify({
            "error": "Failed to extract player response",
            "video_id": video_id
        }), 404
    
    # Получаем spec и duration
    spec = parse_storyboard_spec(player_response)
    duration = get_video_duration(player_response)
    
    if not spec:
        return jsonify({
            "error": "Storyboard spec not found",
            "video_id": video_id
        }), 404
    
    if not duration:
        return jsonify({
            "error": "Video duration not found",
            "video_id": video_id
        }), 404
    
    # Если запрошен только spec
    if format_type == 'spec':
        return jsonify({
            "video_id": video_id,
            "spec": spec,
            "duration": duration,
            "title": player_response.get('videoDetails', {}).get('title', '')
        })
    
    # Генерируем URLs
    storyboard_urls = generate_storyboard_urls(spec, hq, duration)
    
    if not storyboard_urls:
        return jsonify({
            "error": "Failed to generate storyboard URLs",
            "video_id": video_id
        }), 500
    
    return jsonify({
        "video_id": video_id,
        "duration": duration,
        "quality": "high" if hq else "low",
        "count": len(storyboard_urls),
        "urls": storyboard_urls,
        "title": player_response.get('videoDetails', {}).get('title', '')
    })

@app.route('/api/storyboard/<video_id>/image/<int:index>', methods=['GET'])
def get_storyboard_image(video_id, index):
    """
    Получить конкретное изображение storyboard
    
    Query параметры:
    - quality: 'hq' (default) или 'lq'
    """
    quality = request.args.get('quality', 'hq').lower()
    hq = quality == 'hq'
    
    # Получаем информацию о storyboard
    html = get_youtube_page(video_id)
    if not html:
        return jsonify({"error": "Failed to fetch YouTube page"}), 404
    
    player_response = extract_player_response(html)
    if not player_response:
        return jsonify({"error": "Failed to extract player response"}), 404
    
    spec = parse_storyboard_spec(player_response)
    duration = get_video_duration(player_response)
    
    if not spec or not duration:
        return jsonify({"error": "Storyboard data not found"}), 404
    
    # Генерируем URLs
    storyboard_urls = generate_storyboard_urls(spec, hq, duration)
    
    if index < 0 or index >= len(storyboard_urls):
        return jsonify({
            "error": "Invalid index",
            "max_index": len(storyboard_urls) - 1
        }), 400
    
    # Загружаем изображение
    try:
        response = requests.get(storyboard_urls[index], timeout=10)
        if response.status_code == 200:
            return send_file(
                io.BytesIO(response.content),
                mimetype='image/jpeg'
            )
        else:
            return jsonify({"error": "Failed to fetch storyboard image"}), 404
    except requests.RequestException:
        return jsonify({"error": "Failed to fetch storyboard image"}), 500


@app.route('/')
def index():
    """Главная страница с информацией"""
    return """
    <h1>YouTube Preview & Storyboard API</h1>
    <p>Прокси для получения превью и storyboard изображений YouTube видео</p>
    
    <h2>Endpoints:</h2>
    <ul>
        <li>GET <code>/api/preview/&lt;video_id&gt;</code> - получить превью (приоритет: storyboard → regular preview)</li>
        <li>GET <code>/api/storyboard/&lt;video_id&gt;</code> - получить информацию о storyboard (JSON)</li>
        <li>GET <code>/api/storyboard/&lt;video_id&gt;/image/&lt;index&gt;</code> - получить конкретное изображение storyboard</li>
    </ul>
    
    <h3>Storyboard параметры:</h3>
    <ul>
        <li><code>quality</code> - 'hq' (высокое качество, по умолчанию) или 'lq' (низкое качество)</li>
        <li><code>format</code> - 'json' (список URLs, по умолчанию) или 'spec' (только spec и duration)</li>
    </ul>
    
    <h3>Примеры:</h3>
    <ul>
        <li><a href="/api/preview/dQw4w9WgXcQ">/api/preview/dQw4w9WgXcQ</a> - превью (storyboard или обычное)</li>
        <li><a href="/api/storyboard/dQw4w9WgXcQ">/api/storyboard/dQw4w9WgXcQ</a> - storyboard info (JSON)</li>
        <li><a href="/api/storyboard/dQw4w9WgXcQ?quality=lq">/api/storyboard/dQw4w9WgXcQ?quality=lq</a> - storyboard info LQ</li>
        <li><a href="/api/storyboard/dQw4w9WgXcQ/image/0">/api/storyboard/dQw4w9WgXcQ/image/0</a> - конкретное изображение</li>
    </ul>
    
    <p><small>Данные загружаются напрямую с YouTube без кэширования</small></p>
    """

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=5000, debug=False)
