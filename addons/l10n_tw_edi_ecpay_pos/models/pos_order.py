import datetime

from odoo import _, fields, models
from odoo.addons.l10n_tw_edi_ecpay.utils import EcPayAPI


class PoSOrder(models.Model):
    _inherit = "pos.order"

    l10n_tw_edi_is_print = fields.Boolean(string="Print")
    l10n_tw_edi_love_code = fields.Char(string="Love Code")
    l10n_tw_edi_carrier_type = fields.Selection(
        string="Carrier Type",
        selection=[("1", "ECpay e-invoice carrier"), ("2", "Citizen Digital Certificate"), ("3", "Mobile Barcode")],
    )
    l10n_tw_edi_carrier_number = fields.Char(string="Carrier Number")

    def _set_invoice_month(self, data):
        invoice_create_date = datetime.datetime.strptime(data, "%Y-%m-%d %H:%M:%S")
        if invoice_create_date.month % 2 == 0:
            invoice_month = (
                str(invoice_create_date.year - 1911) + "年" + str(invoice_create_date.month - 1) + "-" + str(invoice_create_date.month) + "月"
            )
        else:
            invoice_month = (
                str(invoice_create_date.year - 1911) + "年" + str(invoice_create_date.month) + "-" + str(invoice_create_date.month + 1) + "月"
            )
        return invoice_month

    def _prepare_invoice_vals(self):
        vals = super()._prepare_invoice_vals()
        vals.update({
            'l10n_tw_edi_is_print': self.l10n_tw_edi_is_print,
            'l10n_tw_edi_love_code': self.l10n_tw_edi_love_code,
            'l10n_tw_edi_carrier_type': self.l10n_tw_edi_carrier_type,
            'l10n_tw_edi_carrier_number': self.l10n_tw_edi_carrier_number,
        })
        return vals

    def _generate_pos_order_invoice(self):
        res = super()._generate_pos_order_invoice()
        if self.refunded_order_id:
            self.account_move.l10n_tw_edi_origin_invoice_number_id = self.refunded_order_id.account_move
            self.account_move.l10n_tw_edi_ecpay_invoice_id = self.refunded_order_id.account_move.l10n_tw_edi_ecpay_invoice_id
            self.account_move.l10n_tw_edi_invoice_create_date = self.refunded_order_id.account_move.l10n_tw_edi_invoice_create_date
            if self.account_move.l10n_tw_edi_ecpay_invoice_id:
                self.account_move.l10n_tw_edi_issue_allowance()
        return res

    def get_uniform_invoice(self, name):
        pos_order = self.search([("name", "=", name)], limit=1)
        if pos_order.refunded_order_id:
            invoice = pos_order.refunded_order_id.account_move
        else:
            invoice = self.env["account.move"].search([("ref", "=", pos_order.name)], limit=1)

        json_data = {
            "MerchantID": self.company_id.l10n_tw_edi_ecpay_merchant_id,
            "RelateNumber": invoice.l10n_tw_edi_related_number,
        }

        ecpay_api = EcPayAPI(self.company_id)
        response_data = ecpay_api.call_ecpay_api("/GetIssue", json_data)
        json_response = {}
        if response_data.get('RtnCode') != 1:
            error_message = self.env["mail.message"].search([("model", "=", "account.move"), ("res_id", "=", invoice.id), ("message_type", "=", "notification")], limit=1).body
            if self.account_move.l10n_tw_edi_origin_invoice_number_id:  # refund invoice
                json_response["error"] = _("No Ecpay invoice to be refunded")
            else:
                json_response["error"] = error_message

        create_date_utc_time = ecpay_api._transfer_time(response_data.get("IIS_Create_Date").replace("+", " ")) if response_data.get("IIS_Create_Date") else False  # The date return from Ecpay API used "+" instead of " "

        json_response.update({
            "invoice_month": self._set_invoice_month(create_date_utc_time) if create_date_utc_time else False,
            "IIS_Number": response_data.get("IIS_Number", False),
            "IIS_Create_Date": create_date_utc_time,
            "IIS_Random_Number": response_data.get("IIS_Random_Number", False),
            "IIS_Tax_Amount": response_data.get("IIS_Tax_Amount", False),
            "l10n_tw_edi_invoice_amount": response_data.get("IIS_Sales_Amount", False),
            "IIS_Identifier": response_data.get("IIS_Identifier", False),
            "IIS_Carrier_Type": response_data.get("IIS_Carrier_Type", False),
            "IIS_Carrier_Num": response_data.get("IIS_Carrier_Num", False),
            "IIS_Category": response_data.get("IIS_Category", False),
            "l10n_tw_edi_ecpay_seller_identifier": self.env.company.l10n_tw_edi_ecpay_seller_identifier,
            "PosBarCode": response_data.get("PosBarCode", False),
            "QRCode_Left": response_data.get("QRCode_Left", False),
            "QRCode_Right": response_data.get("QRCode_Right", False),
        })
        return json_response
