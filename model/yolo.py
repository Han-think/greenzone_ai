"""Inference for the locally fine-tuned YOLO model used in test mode."""
from dataclasses import dataclass
from pathlib import Path
from threading import Lock

from PIL import Image

MODEL_FILE = Path(__file__).resolve().parent / 'best.pt'
CONFIDENCE_THRESHOLD = 0.25
MAX_DETECTIONS = 20

_load_lock = Lock()
_inference_lock = Lock()
_model = None


@dataclass(frozen=True)
class Detection:
    label: str
    score: float
    box: tuple[float, float, float, float]


def _load_detector():
    global _model
    if _model is not None:
        return _model
    with _load_lock:
        if _model is not None:
            return _model
        if not MODEL_FILE.is_file():
            raise RuntimeError(f'YOLO 모델 파일을 찾을 수 없습니다: {MODEL_FILE}')
        try:
            from ultralytics import YOLO
        except ImportError as error:
            raise RuntimeError(
                'YOLO 시험 모드에 ultralytics가 필요합니다. requirements.txt를 설치하세요.'
            ) from error
        try:
            _model = YOLO(str(MODEL_FILE), task='detect')
        except (OSError, RuntimeError, ValueError) as error:
            raise RuntimeError(f'YOLO 모델을 불러오지 못했습니다: {error}') from error
        return _model


def detect_objects(image: Image.Image) -> list[Detection]:
    """Return confidence-ranked boxes predicted by model/best.pt."""
    model = _load_detector()
    with _inference_lock:
        try:
            results = model.predict(
                source=image.convert('RGB'),
                conf=CONFIDENCE_THRESHOLD,
                verbose=False,
            )
        except (OSError, RuntimeError, ValueError) as error:
            raise RuntimeError(f'YOLO 추론에 실패했습니다: {error}') from error
    if not results:
        return []

    result = results[0]
    boxes = result.boxes
    detections = []
    if boxes is None:
        return detections
    names = result.names
    for index in range(len(boxes)):
        class_id = int(boxes.cls[index].item())
        label = names.get(class_id) if isinstance(names, dict) else names[class_id]
        if not isinstance(label, str) or not label.strip():
            continue
        raw_box = boxes.xyxy[index].tolist()
        x1 = max(0.0, min(float(image.width), float(raw_box[0])))
        y1 = max(0.0, min(float(image.height), float(raw_box[1])))
        x2 = max(0.0, min(float(image.width), float(raw_box[2])))
        y2 = max(0.0, min(float(image.height), float(raw_box[3])))
        if x2 <= x1 or y2 <= y1:
            continue
        detections.append(Detection(
            label=label.strip(),
            score=float(boxes.conf[index].item()),
            box=(x1, y1, x2, y2),
        ))
    detections.sort(key=lambda detection: detection.score, reverse=True)
    return detections[:MAX_DETECTIONS]
