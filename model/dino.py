"""Grounding DINO inference shared by the web service and the optional CLI."""
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parent
CLASS_FILE = ROOT / 'dino_classes.txt'
MODEL_ID = 'IDEA-Research/grounding-dino-tiny'
BOX_THRESHOLD = 0.30
TEXT_THRESHOLD = 0.25
NMS_THRESHOLD = 0.5
MAX_DETECTIONS = 3
MAX_TEXT_TOKENS = 240

_load_lock = Lock()
_inference_lock = Lock()
_processor = None
_model = None
_torch = None
_torchvision = None
_device = None
_text_prompts = []


@dataclass(frozen=True)
class Detection:
    label: str
    score: float
    box: tuple[float, float, float, float]


def _load_detector():
    global _processor, _model, _torch, _torchvision, _device, _text_prompts
    if _model is not None:
        return
    with _load_lock:
        if _model is not None:
            return
        try:
            import torch
            import torchvision
            from transformers import AutoModelForZeroShotObjectDetection, AutoProcessor
        except ImportError as error:
            raise RuntimeError(
                'Grounding DINO 의존성이 없습니다. requirements.txt의 모델 패키지를 설치하세요.'
            ) from error
        if not CLASS_FILE.is_file():
            raise RuntimeError(f'탐지 목록 파일이 없습니다: {CLASS_FILE}')
        classes = [line.strip() for line in CLASS_FILE.read_text(encoding='utf-8').splitlines()
                   if line.strip()]
        if not classes:
            raise RuntimeError('탐지 목록 파일에 클래스가 없습니다.')
        processor = AutoProcessor.from_pretrained(MODEL_ID)
        text_prompts = build_text_prompts(classes, processor.tokenizer)

        device = 'cuda' if torch.cuda.is_available() else (
            'mps' if hasattr(torch.backends, 'mps') and torch.backends.mps.is_available() else 'cpu')
        model = AutoModelForZeroShotObjectDetection.from_pretrained(MODEL_ID).to(device)
        model.eval()
        _torch = torch
        _torchvision = torchvision
        _device = device
        _processor = processor
        _model = model
        _text_prompts = text_prompts


def build_text_prompts(classes, tokenizer, max_tokens=MAX_TEXT_TOKENS):
    """Split class names into grounded-DINO prompts within the text token limit."""
    prompts = []
    batch = []
    for label in classes:
        candidate = batch + [label]
        prompt = ' . '.join(candidate) + ' .'
        token_count = len(tokenizer(prompt, add_special_tokens=True, truncation=False)['input_ids'])
        if token_count <= max_tokens:
            batch = candidate
            continue
        if not batch:
            raise RuntimeError(f'탐지 클래스가 Grounding DINO 토큰 제한을 초과합니다: {label}')
        prompts.append(' . '.join(batch) + ' .')
        batch = [label]
        prompt = label + ' .'
        token_count = len(tokenizer(prompt, add_special_tokens=True, truncation=False)['input_ids'])
        if token_count > max_tokens:
            raise RuntimeError(f'탐지 클래스가 Grounding DINO 토큰 제한을 초과합니다: {label}')
    if batch:
        prompts.append(' . '.join(batch) + ' .')
    return prompts


def detect_objects(image: Image.Image) -> list[Detection]:
    """Return up to three confidence-ranked detections across prompt batches."""
    _load_detector()
    with _inference_lock:
        boxes = []
        scores = []
        labels = []
        for text_prompt in _text_prompts:
            inputs = _processor(images=image.convert('RGB'), text=text_prompt,
                                return_tensors='pt').to(_device)
            with _torch.inference_mode():
                outputs = _model(**inputs)
            results = _processor.post_process_grounded_object_detection(
                outputs,
                input_ids=inputs.input_ids,
                threshold=BOX_THRESHOLD,
                text_threshold=TEXT_THRESHOLD,
                target_sizes=[image.size[::-1]],
            )[0]
            batch_labels = results.get('text_labels', results.get('labels', []))
            if not isinstance(batch_labels, (list, tuple)):
                batch_labels = []
            for index, score in enumerate(results['scores']):
                boxes.append(results['boxes'][index])
                scores.append(score)
                labels.append(batch_labels[index] if index < len(batch_labels) else 'unknown object')
        if not boxes:
            return []
        all_boxes = _torch.stack(boxes)
        all_scores = _torch.stack(scores)
        kept = _torchvision.ops.nms(all_boxes, all_scores, NMS_THRESHOLD)
        detections = []
        for index in kept.tolist():
            x1, y1, x2, y2 = all_boxes[index].tolist()
            x1 = max(0.0, min(float(image.width), float(x1)))
            x2 = max(0.0, min(float(image.width), float(x2)))
            y1 = max(0.0, min(float(image.height), float(y1)))
            y2 = max(0.0, min(float(image.height), float(y2)))
            if x2 <= x1 or y2 <= y1:
                continue
            detections.append(Detection(str(labels[index]), float(all_scores[index].item()),
                                        (x1, y1, x2, y2)))
        detections.sort(key=lambda item: item.score, reverse=True)
        return detections[:MAX_DETECTIONS]


def crop_detection(image: Image.Image, detection: Detection, padding_ratio: float = 0.1) -> Image.Image:
    """Crop a detection with a small context margin, clipping to the image bounds."""
    x1, y1, x2, y2 = detection.box
    padding = max(x2 - x1, y2 - y1) * padding_ratio
    bounds = (max(0, int(x1 - padding)), max(0, int(y1 - padding)),
              min(image.width, int(x2 + padding)), min(image.height, int(y2 + padding)))
    return image.convert('RGB').crop(bounds)


def main():
    input_dir = Path('./input_images')
    output_dir = Path('./output_results')
    crop_dir = output_dir / 'crops'
    annotated_dir = output_dir / 'annotated'
    crop_dir.mkdir(parents=True, exist_ok=True)
    annotated_dir.mkdir(parents=True, exist_ok=True)
    image_paths = [path for path in input_dir.iterdir()
                   if path.suffix.lower() in {'.jpg', '.jpeg', '.png', '.bmp', '.webp'}]
    if not image_paths:
        raise FileNotFoundError(f'{input_dir} 폴더에 이미지가 없습니다.')

    for image_path in image_paths:
        with Image.open(image_path) as source:
            image = source.convert('RGB')
        detections = detect_objects(image)
        annotated = image.copy()
        draw = ImageDraw.Draw(annotated)
        for index, detection in enumerate(detections, start=1):
            crop_detection(image, detection).save(crop_dir / f'{image_path.stem}_obj{index}.jpg')
            draw.rectangle(detection.box, outline='red', width=3)
            draw.text((detection.box[0] + 4, detection.box[1] + 4),
                      f'{detection.label} {detection.score:.2f}', fill='red')
        annotated.save(annotated_dir / f'annotated_{image_path.name}')
        print(f'{image_path.name}: {len(detections)}개 탐지')


if __name__ == '__main__':
    main()
