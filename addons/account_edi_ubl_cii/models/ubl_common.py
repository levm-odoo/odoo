from odoo import models


UBL_NAMESPACES = {
    'cbc': "urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2",
    'cac': "urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2",
}


class UblCommon(models.AbstractModel):
    _name = 'ubl.common'
    _description = 'UBL Common'

    # Properties
    def _get_applicable_countries(self):
        return []

    def _get_default_countries(self):
        return []

    def _is_on_peppol(self):
        return False

    # Export
    def _get_ubl_invoice_vals(self, invoice):
        return {
            "ublextensions": {},
            "ublversion_id": "2.1",
            "customization_id": None,
            "profile_id": None,
            "profile_execution_id": None,
            "id": invoice.name,
            "copy_indicator": None,
            "uuid": None,
            "issue_date": invoice.invoice_date,
            "issue_time": None,
            "due_date": invoice.invoice_date_due,
            "invoice_type_code": None,
            "note": invoice.narration and html2plaintext(invoice.narration),
            "tax_point_date": None,
            "document_currency_code": invoice.currency_id.name,
            "tax_currency_code": None,
            "pricing_currency_code": None,
            "payment_currency_code": None,
            "payment_alternative_currency_code": None,
            "accounting_cost_code": None,
            "accounting_cost": None,
            "line_count_numeric": None,
            "buyer_reference": None,
            "invoice_period_list": [],
            "order_reference": {},
            "billing_reference_list": [],
            "despatch_document_reference_list": [],
            "receipt_document_reference_list": [],
            "statement_document_reference_list": [],
            "originator_document_reference_list": [],
            "contract_document_reference_list": [],
            "additional_document_reference_list": [],
            "project_reference_list": [],
            "signature_list": [],
            "accounting_supplier_party": {},
            "accounting_customer_party": {},
            "payee_party": {},
            "buyer_customer_party": {},
            "seller_supplier_party": {},
            "tax_representative_party": {},
            "delivery_list": [],
            "delivery_terms": {},
            "payment_means_list": [],
            "payment_terms_list": [],
            "prepaid_payment_list": [],
            "allowance_charge_list": [],
            "tax_exchange_rate": {},
            "pricing_exchange_rate": {},
            "payment_exchange_rate": {},
            "payment_alternative_exchange_rate": {},
            "tax_total_list": [],
            "withholding_tax_total_list": [],
            "legal_monetary_total": {},
            "invoice_line_list": []
        }

    def _get_invoice_period(self, invoice):
        return {
            "start_date": invoice.invoice_date,
            "start_time": None,
            "end_date": invoice.invoice_date,
            "end_time": None,
            "duration_measure": None,
            "description_code": None,
        }

    def _get_invoice_order_reference(self, invoice):
        # not used ?
        return {
            "id": invoice.ref or invoice.name,
            "sales_order_id": self._get_invoice_sales_order_id(invoice),
            "copy_indicator": None,
            "uuid": None,
            "issue_date": invoice.invoice_date,
            "issue_time": None,
            "customer_reference": None,
            "order_type_code": None,
            "document_reference": self._get_document_reference(invoice),
        }

    def _get_document_reference(self, invoice):
        # not used ?
        return {
            "id": None,
            "copy_indicator": None,
            "uuid": None,
            "issue_date": None,
            "issue_time": None,
            "document_type_code": None,
            "document_type": None,
            "xpath": None,
            "language_id": None,
            "locale_code": None,
            "version_id": None,
            "document_status_code": None,
            "document_description": None,
            # TODO
        }
