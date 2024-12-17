from odoo import api, models
from odoo.addons.l10n_tw_edi_ecpay.utils import EcPayAPI


class AccountMove(models.Model):
    _inherit = "account.move"

    @api.model
    def l10n_tw_edi_check_mobile_barcode(self, text):

        json_data = {
            "MerchantID": self.env.company.l10n_tw_edi_ecpay_merchant_id,
            "BarCode": text,
        }

        response_data = EcPayAPI(self.env.company).call_ecpay_api("/CheckBarcode", json_data)
        return response_data.get("RtnCode") == 1 and response_data.get("IsExist") == "Y"

    @api.model
    def l10n_tw_edi_check_love_code(self, text):

        json_data = {
            "MerchantID": self.env.company.l10n_tw_edi_ecpay_merchant_id,
            "LoveCode": text,
        }

        response_data = EcPayAPI(self.env.company).call_ecpay_api("/CheckLoveCode", json_data)
        return response_data.get("RtnCode") == 1 and response_data.get("IsExist") == "Y"

    @api.model
    def l10n_tw_edi_check_tax_id(self, text):

        json_data = {
            "MerchantID": self.env.company.l10n_tw_edi_ecpay_merchant_id,
            "UnifiedBusinessNo": text,
        }

        response_data = EcPayAPI(self.env.company).call_ecpay_api("/GetCompanyNameByTaxID", json_data)
        return response_data.get("RtnCode") == 1 and response_data.get("CompanyName")
