import json
import requests
from unittest.mock import Mock

from odoo.addons.hr_expense.tests.common import TestExpenseCommon
from odoo.tools import file_open

def _get_mock_response():
    mock_response = Mock(spec=requests.Response)
    mock_response.json.return_value = {}
    return mock_response

def _create_mock_response_with_json_file(filename):
    mock_response = Mock(spec=requests.Response)

    with file_open(f'hr_expense_stripe/tests/stripe_objects_json/{filename}', 'rb') as file:
        mock_response.json.return_value = json.load(file)

    return mock_response

def mock_stripe_request(method, url, *args, **kwargs):
    if method == 'GET':
        return _get_mock_response()

    if url == 'https://api.stripe.com/v1/issuing/cardholders':
        return _create_mock_response_with_json_file('issuing_cardholder.json')

    if url == 'https://api.stripe.com/v1/issuing/cards':
        return _create_mock_response_with_json_file('issuing_card.json')


class TestExpenseStripeCommon(TestExpenseCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.company.stripe_issuing_account_type = 'own_account'
        cls.company.stripe_mode = 'test'
        cls.company.stripe_secret_test_key = 'sk_test_xxx'
        cls.company.stripe_journal_id = cls.env['account.journal'].create({
            'code': 'STRPI',
            'name': 'Stripe Issuing',
            'type': 'bank',
        })

        cls.stripe_employee = cls.expense_user_employee.employee_ids.filtered_domain([('company_id', '=', cls.company.id)])
        cls.stripe_employee.write({
            'work_email': 'an.employee@example.com',
            'mobile_phone': '+32477 11 22 33',
            'private_first_name': 'An',
            'private_last_name': 'Employee',
            'private_street': 'Avenue Something',
            'private_city': 'Bruxelles',
            'private_zip': '1000',
            'private_country_id': cls.env.ref('base.be'),
        })

        cls.mock_cardholder_stripe_id = 'ich_1MsKAB2eZvKYlo2C3eZ2BdvK'
        cls.mock_card_stripe_id = 'ic_1MvSieLkdIwHu7ixn6uuO0Xu'

