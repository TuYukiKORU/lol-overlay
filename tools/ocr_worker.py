"""Isolated local Windows OCR worker. Receives only temporary cropped images."""
import asyncio
import json
from pathlib import Path
import sys


async def recognize(items):
    from winrt.windows.globalization import Language
    from winrt.windows.media.ocr import OcrEngine
    from winrt.windows.storage import StorageFile, FileAccessMode
    from winrt.windows.graphics.imaging import BitmapDecoder

    engine = OcrEngine.try_create_from_language(Language('en-US'))
    if engine is None:
        raise RuntimeError('Windowsの英語OCR言語がインストールされていません。')
    results = []
    for item in items:
        file = await StorageFile.get_file_from_path_async(item['path'])
        stream = await file.open_async(FileAccessMode.READ)
        try:
            decoder = await BitmapDecoder.create_async(stream)
            bitmap = await decoder.get_software_bitmap_async()
            try:
                result = await engine.recognize_async(bitmap)
                results.append({'id': item['id'], 'text': result.text})
            finally:
                bitmap.close()
        finally:
            stream.close()
    return results


if __name__ == '__main__':
    sys.stdout.reconfigure(encoding='utf-8')
    sys.stderr.reconfigure(encoding='utf-8')
    try:
        items = json.loads(Path(sys.argv[1]).read_text(encoding='utf-8'))
        print(json.dumps(asyncio.run(recognize(items)), ensure_ascii=False))
    except Exception as exc:
        print(str(exc), file=sys.stderr)
        sys.exit(1)
