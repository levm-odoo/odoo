# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.addons.payment.tests.common import PaymentCommon
from odoo.addons.account.tests.common import AccountTestInvoicingCommon

class WorldlineCommon(AccountTestInvoicingCommon, PaymentCommon):

    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        cls.worldline = cls._prepare_provider('worldline', update_values={
            'worldline_psp_id': 'dummy',
            'worldline_api_key': 'dummy',
            'worldline_api_secret': 'dummy',
            'worldline_webhook_key': 'dummy',
            'worldline_webhook_secret': 'dummy',
        })

        cls.provider = cls.worldline
        cls.currency = cls.currency_euro

        cls.notification_data = {
            'payment': {
                'paymentOutput' : {
                    'references': {
                        'merchantReference': cls.reference,
                    },
                    'cardPaymentMethodSpecificOutput': {
                        'paymentProductId': 1,
                        'card': {
                            'cardNumber': "******4242"
                        },
                        'token': 'whateverToken'
                    },
                },
                'status': 'CAPTURED',
            },
        }
