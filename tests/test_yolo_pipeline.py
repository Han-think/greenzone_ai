import asyncio
import io
import unittest
from unittest.mock import patch

from PIL import Image
from starlette.requests import Request

import service_routes
from model import yolo
from model.yolo import Detection


class FakeScalar:
    def __init__(self, value):
        self.value = value

    def item(self):
        return self.value


class FakeBox:
    cls = [FakeScalar(0)]
    conf = [FakeScalar(0.875)]
    xyxy = [type('Coords', (), {'tolist': lambda self: [-2, 4, 30, 45]})()]

    def __len__(self):
        return 1


class FakeResult:
    boxes = FakeBox()
    names = {0: '소파'}


class FakeModel:
    def __init__(self):
        self.options = None

    def predict(self, **options):
        self.options = options
        return [FakeResult()]


class YoloPipelineTests(unittest.TestCase):
    def test_detection_uses_model_predictions_and_clips_boxes(self):
        model = FakeModel()
        with patch.object(yolo, '_model', model):
            detections = yolo.detect_objects(Image.new('RGB', (20, 25)))

        self.assertEqual(model.options['conf'], yolo.CONFIDENCE_THRESHOLD)
        self.assertEqual(model.options['verbose'], False)
        self.assertEqual(detections, [Detection('소파', 0.875, (0.0, 4.0, 20.0, 25.0))])

    def test_matching_prefers_exact_catalog_names_and_skips_unknown_classes(self):
        items = [
            {'item_id': 'sofa-stool', 'name': '소파스툴'},
            {'item_id': 'sofa', 'name': '소파(안락의자)'},
            {'item_id': 'table', 'name': '밥상(교자상)'},
        ]
        candidates = service_routes.match_yolo_candidates([
            Detection('소파', 0.91, (0, 0, 5, 5)),
            Detection('수납장', 0.8, (0, 0, 5, 5)),
            Detection('밥상', 0.73, (0, 0, 5, 5)),
        ], items)

        self.assertEqual([item['item_id'] for item in candidates], ['sofa', 'table'])

    def test_yolo_mode_bypasses_gemini_and_returns_detections(self):
        image_bytes = io.BytesIO()
        Image.new('RGB', (12, 10), 'white').save(image_bytes, format='PNG')
        body = image_bytes.getvalue()

        async def receive():
            nonlocal body
            if body:
                data, body = body, b''
                return {'type': 'http.request', 'body': data, 'more_body': False}
            return {'type': 'http.disconnect'}

        request = Request({
            'type': 'http',
            'method': 'POST',
            'path': '/api/vision',
            'headers': [(b'content-type', b'image/png')],
            'query_string': b'mode=yolo',
            'server': ('testserver', 80),
            'client': ('testclient', 123),
            'scheme': 'http',
            'http_version': '1.1',
        }, receive)
        detections = [Detection('소파', 0.91, (1, 2, 8, 9))]
        with patch.object(service_routes, 'detect_yolo_objects', return_value=detections):
            with patch.object(service_routes.guide, 'list_items', return_value=[
                {'item_id': 'sofa', 'name': '소파(안락의자)'}
            ]):
                with patch.object(service_routes, 'identify_disposal_candidates',
                                  side_effect=AssertionError('Gemini must not be called')):
                    result = asyncio.run(service_routes.upload_image(request, mode='yolo'))

        self.assertEqual(result['mode'], 'yolo')
        self.assertFalse(result['provider_called'])
        self.assertFalse(result['stored'])
        self.assertEqual(result['candidates'][0]['item_id'], 'sofa')
        self.assertEqual(result['detections'][0]['label'], '소파')
        self.assertEqual(result['detections'][0]['box'], [1, 2, 8, 9])


if __name__ == '__main__':
    unittest.main()
