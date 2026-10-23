"""근거 ID·금액·색인 갱신의 핵심 계약 검사. 외부 모델 호출은 하지 않는다."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from server import rag_service as rag


class RagContractTests(unittest.TestCase):
    def setUp(self):
        self.doc = {'document_id': 'TEST', 'title': '검수 문서', 'text': '공식 안내 문단',
            'source_url': 'https://smartclean.yangcheon.go.kr/online/bulky/guide',
            'checked_at': '2026-10-22', 'effective_from': None}
        self.matches = [{'chunk_id': 'TEST:1', 'document': self.doc, 'text': self.doc['text']}]

    def test_unknown_source_and_uncited_answer_rejected(self):
        for ids in [['INVENTED:1'], []]:
            with self.assertRaises(ValueError):
                rag.validate_answer({'status': 'answered', 'answer': '안내',
                    'source_chunk_ids': ids, 'needed_fields': []}, self.matches)

    def test_model_money_and_url_rejected(self):
        for text in ['금액은 9999원입니다.', 'https://example.com 으로 가세요.']:
            with self.assertRaises(ValueError):
                rag.validate_answer({'status': 'answered', 'answer': text,
                    'source_chunk_ids': ['TEST:1'], 'needed_fields': []}, self.matches)

    def test_source_url_comes_from_server_document(self):
        answer = rag.validate_answer({'status': 'answered', 'answer': '공식 절차를 확인하세요.',
            'source_chunk_ids': ['TEST:1', 'TEST:1'], 'needed_fields': []}, self.matches)
        self.assertEqual(len(answer['sources']), 1)
        self.assertEqual(answer['sources'][0]['url'], self.doc['source_url'])

    def test_fee_uses_selected_database_row(self):
        row = next(r for r in rag.guide.list_records('rules')
            if r['official_name'].startswith('소파(') and r['specification'] == '2인용')
        context, answer = rag.item_context('수수료 얼마인가요?', row['item_id'], row['rule_id'], 2)
        self.assertEqual(answer['status'], 'answered')
        self.assertIn(f"{row['fee_krw'] * 2:,}원", answer['answer'])
        context, answer = rag.item_context('수수료 얼마인가요?', row['item_id'], None, 1)
        self.assertEqual(answer['status'], 'needs_confirmation')
        self.assertEqual(answer['needed_fields'], ['rule_id'])

    def test_fee_procedure_and_changed_item_are_not_wrong_price(self):
        row = next(r for r in rag.guide.list_records('rules')
            if r['official_name'].startswith('소파(') and r['specification'] == '2인용')
        context, answer = rag.item_context('수수료는 어디서 결제하나요?', row['item_id'], row['rule_id'], 1)
        self.assertIsNone(answer)
        context, answer = rag.item_context('장롱은 얼마인가요?', row['item_id'], row['rule_id'], 1)
        self.assertEqual(answer['status'], 'needs_confirmation')
        self.assertIn('item_id', answer['needed_fields'])

    def test_missing_key_and_provider_error_return_safe_error(self):
        with patch.dict(rag.os.environ, {'OPIK_ENABLED': 'false'}):
            with patch.object(rag.vision_service, 'settings', return_value=None):
                answer = rag.answer_question('대형폐기물 신청 절차가 궁금해요.')
                self.assertEqual(answer['status'], 'error')
            with patch.object(rag.vision_service, 'settings', return_value=('private-test-key', 'gemini-test')):
                with patch.object(rag, 'build_index', side_effect=OSError('private-test-key')):
                    answer = rag.answer_question('대형폐기물 신청 절차가 궁금해요.')
                    self.assertEqual(answer['status'], 'error')
                    self.assertNotIn('private-test-key', json.dumps(answer))

    def test_collection_exception_is_preserved(self):
        doc = dict(self.doc, document_id='YC-GUIDE-TEST',
            text='배출일 다음날부터 순차 수거합니다(주말·공휴일 제외). 물량에 따라 지연될 수 있습니다.')
        matches = [{'chunk_id': 'YC-GUIDE-TEST:1', 'document': doc, 'text': doc['text']}]
        answer = rag.validate_answer({'status': 'answered', 'answer': '수거는 다음날부터 시작합니다.',
            'source_chunk_ids': ['YC-GUIDE-TEST:1'], 'needed_fields': []}, matches)
        self.assertIn('주말', answer['answer'])
        self.assertIn('공휴일', answer['answer'])
        self.assertIn('지연', answer['answer'])

    def test_mismatched_selection_rejected(self):
        row = rag.guide.list_records('rules')[0]
        with self.assertRaises(ValueError):
            rag.item_context('', 'unknown-item', row['rule_id'], 1)

    def test_changed_document_rebuilds_index_without_question_storage(self):
        def fake_google(path, payload, key):
            return {'embeddings': [{'values': [1.0] * 768} for r in payload['requests']]}
        with tempfile.TemporaryDirectory() as folder:
            target = Path(folder) / 'index.json'
            with patch.object(rag, 'INDEX_FILE', target), patch.object(rag, 'call_google', side_effect=fake_google) as api:
                first = rag.build_index([self.doc], 'not-a-key', 'gemini-embedding-001')
                rag.build_index([self.doc], 'not-a-key', 'gemini-embedding-001')
                self.assertEqual(api.call_count, 1)
                changed = dict(self.doc, text='바뀐 공식 안내')
                second = rag.build_index([changed], 'not-a-key', 'gemini-embedding-001')
                self.assertEqual(api.call_count, 2)
                self.assertNotEqual(first['fingerprint'], second['fingerprint'])
                self.assertNotIn('question', json.loads(target.read_text(encoding='utf-8')))


if __name__ == '__main__':
    unittest.main()
