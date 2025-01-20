from unittest.mock import patch

from odoo.addons.hr_expense_stripe.tests.common import TestExpenseStripeCommon, mock_stripe_request
from odoo.tests import tagged

@tagged('-at_install', 'post_install')
class TestExpenseStripe(TestExpenseStripeCommon):

    def test_create_stripe_issuing_card(self):
        with patch(
            "odoo.addons.hr_expense_stripe.utils.requests.request",
            side_effect=mock_stripe_request,
        ):
            stripe_card = self.env['hr.expense.stripe.credit.card'].create({
                'cardholder_id': self.stripe_employee.id,
            })

        self.assertEqual(stripe_card.stripe_id, self.mock_card_stripe_id)
        self.assertEqual(self.stripe_employee.id, stripe_card.cardholder_id.id)
        self.assertEqual(self.stripe_employee.stripe_id, self.mock_cardholder_stripe_id)
