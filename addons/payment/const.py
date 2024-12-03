# Part of Odoo. See LICENSE file for full copyright and licensing details.

from odoo.tools.translate import LazyTranslate


_lt = LazyTranslate(__name__, default_lang='en_US')

REPORT_REASONS_MAPPING = {
    'exceed_max_amount': _lt("maximum amount exceeded"),
    'express_checkout_not_supported': _lt("express checkout not supported"),
    'incompatible_country': _lt("incompatible country"),
    'incompatible_currency': _lt("incompatible currency"),
    'incompatible_website': _lt("incompatible website"),
    'manual_capture_not_supported': _lt("manual capture not supported"),
    'provider_not_available': _lt("no supported provider available"),
    'tokenization_not_supported': _lt("tokenization not supported"),
    'validation_not_supported': _lt("tokenization without payment no supported"),
}
