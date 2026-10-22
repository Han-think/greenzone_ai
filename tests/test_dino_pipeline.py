import io
import json
import os
import unittest
from unittest.mock import patch

from PIL import Image

import service_routes
from model.dino import Detection, build_text_prompts, crop_detection


class GroundingDinoPipelineTests(unittest.TestCase):
    def setUp(self):
        self.response_body = json.dumps({
            'candidates': [{
                'content': {'parts': [{
                    'text': json.dumps({'candidates': [{
                        'item_id': 'item-1',
                        'name': '소파',
                        'reason': '형태가 비슷함',
                    }]})
                }]}
            }]
        }).encode()
        self.request_payloads = []

    def test_crop_adds_margin_and_clips_to_image(self):
        image = Image.new('RGB', (100, 60))
        crop = crop_detection(image, Detection('sofa', 0.9, (0, 0, 20, 20)))
        self.assertEqual(crop.size, (22, 22))

    def test_class_prompts_are_split_before_token_limit(self):
        def tokenizer(prompt, **kwargs):
            return {'input_ids': prompt.split() + ['special-start', 'special-end']}

        prompts = build_text_prompts(['sofa', 'chair', 'bed', 'desk'], tokenizer, max_tokens=6)
        self.assertEqual(prompts, ['sofa . chair .', 'bed . desk .'])

    def test_gemini_receives_original_and_top_detection_crop(self):
        self._run_identification(
            [Detection('sofa', 0.92, (10, 10, 40, 40))],
            b'jpeg crop',
            expected_images=2,
        )
        parts = self.request_payloads[0]['contents'][0]['parts']
        self.assertIn('sofa (점수 0.92)', parts[0]['text'])
        self.assertIn('inlineData', parts[2])
        self.assertIn('inlineData', parts[4])

    def test_gemini_receives_only_original_when_dino_finds_nothing(self):
        self._run_identification([], None, expected_images=1)
        parts = self.request_payloads[0]['contents'][0]['parts']
        self.assertEqual(sum('inlineData' in part for part in parts), 1)

    def _run_identification(self, detections, crop_data, expected_images):
        def fake_urlopen(request, timeout):
            self.assertEqual(timeout, 35)
            self.request_payloads.append(json.loads(request.data))
            return io.BytesIO(self.response_body)

        with patch.dict(os.environ, {'GEMINI_API_KEY': 'test-key'}):
            with patch.object(service_routes.urllib.request, 'urlopen', fake_urlopen):
                candidates = service_routes.identify_disposal_candidates(
                    b'original image',
                    'image/png',
                    [{'item_id': 'item-1', 'name': '소파'}],
                    detections,
                    crop_data,
                )
        self.assertEqual(candidates[0]['item_id'], 'item-1')
        image_count = sum('inlineData' in part
                          for part in self.request_payloads[-1]['contents'][0]['parts'])
        self.assertEqual(image_count, expected_images)


if __name__ == '__main__':
    unittest.main()
