# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import requests

from odoo import api, fields, models
from odoo.exceptions import ValidationError

URL = "https://etims-api-sbx.kra.go.ke/etims-api/"
DEVICE_INIT_URL = URL + "selectInitOsdcInfo"
NOTICE_SEARCH_URL = URL + "selectNoticeList"
CUSTOMS_IMPORT_URL = URL + "selectImportItemList"


class ResCompany(models.Model):
    _inherit = 'res.company'

    l10n_ke_oscu_branch_code = fields.Char(string='Branch ID')
    l10n_ke_oscu_serial_number = fields.Char(string='Serial Number')
    l10n_ke_oscu_cmc_key = fields.Char(string='Device Communication Key')

    l10n_ke_oscu_seq_invoice_id = fields.Many2one('ir.sequence', help='Sequence used when reporting invoices to the KRA using eTIMS.')
    l10n_ke_oscu_seq_vendor_bill_id = fields.Many2one('ir.sequence', help='Sequence used when reporting vendor bills to the KRA using eTIMS.')
    l10n_ke_oscu_seq_stock_io_id = fields.Many2one('ir.sequence', help='Sequence used when reporting stock IO to the KRA using eTIMS.')

    l10n_ke_oscu_last_fetch_purchase_date = fields.Char(default='20180101000000')

    def action_l10n_ke_oscu_initialize(self):
        """ Initializing the device is necessary in order to receive the cmc key

        The cmc key is a token, necessary for all subsequent communication with the device.
        """
        for company in self:
            session = requests.session()
            branch_code = company.l10n_ke_oscu_branch_code
            content = {
                'tin':       company.vat,                        # VAT No
                'bhfId':     branch_code,                        # Branch ID
                'dvcSrlNo':  company.l10n_ke_oscu_serial_number, # Device serial number
            }
            response = session.post(DEVICE_INIT_URL, json=content)
            response_content = response.json()
            if response_content['resultCd'] == '000':
                info = response_content['data']['info']
                print(info)
                company.l10n_ke_oscu_cmc_key = info['cmcKey']
                # Create OSCU sequences on the company
                sequence_name_and_code = [
                    (f'OSCU Branch {branch_code}: Customer Invoice Number', f'l10n.ke.oscu.invoice.{branch_code}'),
                    (f'OSCU Branch {branch_code}: Vendor Bill Number', f'l10n.ke.oscu.bill.{branch_code}'),
                    (f'OSCU Branch {branch_code}: Stock IO Number', f'l10n.ke.oscu.stock.io.{branch_code}'),
                ]
                (
                    company.l10n_ke_oscu_seq_invoice_id,
                    company.l10n_ke_oscu_seq_vendor_bill_id,
                    company.l10n_ke_oscu_seq_stock_io_id,
                ) = self.env['ir.sequence'].create([{
                        'name': name,
                        'code': code,
                        'implementation': 'no_gap',
                        'company_id': company.id,
                } for name, code in sequence_name_and_code])
                # Activate crons
                self.env.ref("l10n_ke_edi_oscu.fetch_kra_codes_cron").active = True

    def action_l10n_ke_get_customs_imports(self):
        session = self.l10n_ke_oscu_get_session()
        content = {
            'tin': self.vat,
            'bhfId': self.l10n_ke_oscu_branch_code,
            'cmcKey': self.l10n_ke_oscu_cmc_key,
            'lastReqDt': '20180101000000',
        }
        response = session.post(CUSTOMS_IMPORT_URL, json=content)
        print(response.json())
        for item in response.json()['data']['itemList']:
            self.env['l10n_ke_edi.customs.import'].create({'name': item})

    def action_l10n_ke_create_branch_user(self):
        session = self.l10n_ke_oscu_get_session()
        user = self.env.user
        content = {
            'tin': self.vat,
            'bhfId': self.l10n_ke_oscu_branch_code,
            'cmcKey': self.l10n_ke_oscu_cmc_key,
            'lastReqDt': '20180101000000',
            'userId': user.id,
            'userNm': user.login,
            'pwd': '1234',
            'useYn': "Y",
            "regrId": "Test",
            "regrNm": "Test", "modrId": "Test", "modrNm": "Test"
        }
        response = session.post(URL + 'saveBhfUser', json=content)
        import pdb; pdb.set_trace()


    def action_l10n_ke_create_branches(self):
        session = self.l10n_ke_oscu_get_session()
        content = {
         'tin': self.vat,
         'bhfId': self.l10n_ke_oscu_branch_code,
         'cmcKey': self.l10n_ke_oscu_cmc_key or self.parent_id.l10n_ke_oscu_cmc_key,
         'lastReqDt': '20180101000000',
        }
        response = session.post(URL + 'selectBhfList', json=content)
        data = response.json()['data']
        for bhf in data['bhfList']:
            if bhf['bhfId'] != self.l10n_ke_oscu_branch_code:
                company = self.search([('id', 'child_of', self.id), ('l10n_ke_oscu_branch_code', '=', bhf['bhfId'])], limit=1)
                if not company:
                    self.create({
                        'parent_id': self.id,
                        'name': bhf['bhfNm'],
                        'l10n_ke_oscu_branch_code': bhf['bhfId'],
                    })

    def action_l10n_ke_oscu_get_notices(self):
        """ Retrieve the notices TODO explanation """

        last_request_date = self.env['ir.config_parameter'].get_param('l10n_ke_oscu.last_notice_request_date', '20180101000000')
        content = {
            'tin': self.vat,
            'bhfId': self.l10n_ke_oscu_branch_code,
            'cmcKey': self.l10n_ke_oscu_cmc_key,
            'lastReqDt': last_request_date,
        }
        session = self.l10n_ke_oscu_get_session()
        response = session.post(NOTICE_SEARCH_URL, json=content)
        response_content = response.json()
        if response_content['resultCd'] == '001':
            return None
        if response_content['resultCd'] != '000':
            raise ValidationError()
        # response_content['data']
        return response

    def l10n_ke_oscu_get_session(self):
        """ Return a requests.session with the appropriate header fields for usage with the OSCU """
        session = requests.Session()
        session.headers.update({
            'tin': self.vat,
            'bhfid': self.l10n_ke_oscu_branch_code,
            'cmcKey': self.l10n_ke_oscu_cmc_key or self.parent_id.l10n_ke_oscu_cmc_key,
        })
        return session

