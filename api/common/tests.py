from accounts.test_management import Base
from accounts.tests import body
from branches.models import Branch


class PaginationTests(Base):
    """?page_number=&page_size=&search_term= on every list API (common/pagination.py)."""

    def setUp(self):
        super().setUp()  # creates branches DXB1 (Dubai Marina) and SHJ1 (Sharjah)
        Branch.objects.bulk_create(Branch(name=f'Branch {i:02}', code=f'B{i:02}') for i in range(1, 24))
        self.as_owner()  # 25 branches in all, ordered by name

    def get(self, query=''):
        return self.client.get(f'/api/branches/{query}')

    def test_without_parameters_the_whole_list_comes_back(self):
        res = self.get()
        self.assertEqual(res.status_code, 200)
        self.assertEqual(len(body(res)), 25)  # a plain list, as before

    def test_page(self):
        page = body(self.get('?page_number=2&page_size=10'))
        self.assertEqual(set(page), {'items', 'page_number', 'page_size', 'total_count', 'total_pages'})
        self.assertEqual([b['name'] for b in page['items']][:2], ['Branch 11', 'Branch 12'])
        self.assertEqual(len(page['items']), 10)
        self.assertEqual((page['page_number'], page['page_size'], page['total_count'], page['total_pages']),
                         (2, 10, 25, 3))

        last = body(self.get('?page_number=3&page_size=10'))
        self.assertEqual(len(last['items']), 5)

    def test_defaults_and_limits(self):
        page = body(self.get('?page_number=1'))
        self.assertEqual((page['page_size'], len(page['items'])), (10, 10))  # default size

        self.assertEqual(body(self.get('?page_size=1000'))['page_size'], 100)  # capped

        past_end = body(self.get('?page_number=9&page_size=10'))
        self.assertEqual((past_end['items'], past_end['total_count']), ([], 25))

    def test_bad_numbers(self):
        for query in ('?page_number=0', '?page_number=abc', '?page_size=-5'):
            res = self.get(query)
            self.assertEqual(res.status_code, 400, query)
            self.assertEqual(res.data['errors'][0]['error_code'], 'VALIDATION_ERROR')

    def test_search_term(self):
        self.assertEqual([b['code'] for b in body(self.get('?search_term=sharjah'))], ['SHJ1'])  # name
        self.assertEqual([b['code'] for b in body(self.get('?search_term=dxb1'))], ['DXB1'])     # code

        page = body(self.get('?search_term=branch 2&page_number=1&page_size=2'))  # every word must match
        self.assertEqual([b['name'] for b in page['items']], ['Branch 02', 'Branch 12'])
        self.assertEqual((page['total_count'], page['total_pages']), (6, 3))  # 02, 12, 20, 21, 22, 23
