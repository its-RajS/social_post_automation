import unittest
from unittest.mock import patch

from worker.generator import _get_review_feedback


class EmptyCollection:
    def count(self):
        return 0


class EmptyChromaClient:
    def get_or_create_collection(self, _name):
        return EmptyCollection()


class ReviewFeedbackTests(unittest.TestCase):
    @patch('chromadb.HttpClient', return_value=EmptyChromaClient())
    def test_empty_collection_returns_two_empty_feedback_groups(self, _client):
        self.assertEqual(_get_review_feedback('topic', 'template'), ([], []))


if __name__ == '__main__':
    unittest.main()
