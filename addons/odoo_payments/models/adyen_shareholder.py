# Part of Odoo. See LICENSE file for full copyright and licensing details.

import uuid

from odoo import api, fields, models

from odoo.addons.odoo_payments.models.adyen_kyc_check import ADYEN_KYC_STATUS


class AdyenShareholder(models.Model):
    _name = 'adyen.shareholder'
    _inherit = ['adyen.id.mixin', 'adyen.address.mixin']
    _description = "Odoo Payments Shareholder"
    _rec_name = 'full_name'

    #=========== ANY FIELD BELOW THIS LINE HAS NOT BEEN CLEANED YET ===========#

    adyen_account_id = fields.Many2one(
        comodel_name='adyen.account', ondelete='cascade', required=True)
    shareholder_reference = fields.Char(string='Reference', default=lambda self: uuid.uuid4().hex, required=True, readonly=True)
    code = fields.Char(string="Code")
    first_name = fields.Char(string='First Name', required=True)
    last_name = fields.Char(string='Last Name', required=True)
    full_name = fields.Char(compute='_compute_full_name')
    date_of_birth = fields.Date(string='Date of birth', required=True)
    document_number = fields.Char(string='ID Number',
            help="The type of ID Number required depends on the country:\n"
             "US: Social Security Number (9 digits or last 4 digits)\n"
             "Canada: Social Insurance Number\nItaly: Codice fiscale\n"
             "Australia: Document Number")

    # adyen_kyc_ids = fields.One2many(comodel_name='adyen.kyc', inverse_name='shareholder_id')
    kyc_status = fields.Selection(selection=ADYEN_KYC_STATUS, compute='_compute_kyc_status')
    kyc_status_message = fields.Char(compute='_compute_kyc_status', readonly=True)

    #=== COMPUTE METHODS ===#

    #=== CONSTRAINT METHODS ===#

    #=== CRUD METHODS ===#

    #=== ACTION METHODS ===#

    #=== BUSINESS METHODS ===#

    def _prepare_shareholders_data(self):
        """ Prepare the payload for the shareholder data in Adyen format.

        :return: The adyen-formatted payload for the shareholder data
        :rtype: list
        """
        if not self:  # No shareholder is created yet
            return None
        else:
            # Build an array of shareholder details for each existing shareholder
            return [
                {
                    'address': {
                        'city': shareholder.city,
                        'country': shareholder.country_id.code or None,
                        'houseNumberOrName': shareholder.house_number_or_name,
                        'postalCode': shareholder.zip,
                        'stateOrProvince': shareholder.state_id.code or None,
                        'street': shareholder.street,
                    },
                    # 'email': None,
                    # 'fullPhoneNumber': None,
                    # 'jobTitle': None,
                    'name': {
                        'firstName': shareholder.first_name,
                        'gender': 'UNKNOWN',  # TODO convert to selection with mapping
                        # 'infix': None,
                        'lastName': shareholder.last_name,
                    },
                    'personalData': {
                        'dateOfBirth': str(shareholder.date_of_birth),
                        'documentData': [
                            {
                                # 'expirationDate': None,
                                # 'issuerCountry': None,
                                # 'issuerState': None,
                                'number': shareholder.document_number,
                                # FIXME ANVFE fix the whole document verification logic
                                # document_type not specified on shareholders
                                # use a dedicated model for documents for Adyen?
                                'type': shareholder.document_type,
                            }
                        ] if shareholder.document_number else []
                        # 'nationality': None,
                    },
                    # 'phoneNumber': {
                    #     'phoneCountryCode': None,
                    #     'phoneNumber': None,
                    #     'phoneType': None,  # Landline/Mobile/SIP/Fax
                    # },
                    'shareholderCode': shareholder.code or None,
                    'shareholderReference': shareholder.shareholder_reference,
                    # 'shareholderType': None,  # Owner/Controller
                    # 'webAddress': None,
                } for shareholder in self
            ]

    #=========== ANY METHOD BELOW THIS LINE HAS NOT BEEN CLEANED YET ===========#

    @api.depends_context('lang')
    # @api.depends('adyen_kyc_ids')
    def _compute_kyc_status(self):
        self.kyc_status_message = False
        self.kyc_status = False
        #for shareholder in self.filtered('adyen_kyc_ids'):
        #    kyc = shareholder.adyen_kyc_ids._sort_by_status()
        #    shareholder.kyc_status = kyc[0].status
        #    # FIXME ANVFE what about the kyc_status_message ?

    @api.depends('first_name', 'last_name')
    def _compute_full_name(self):
        for adyen_shareholder in self:
            adyen_shareholder.full_name = f'{adyen_shareholder.first_name} {adyen_shareholder.last_name}'

    # @api.model
    # def create(self, values):
    #     adyen_shareholder = super().create(values)
    #     # TODO ANVFE retry mechanism ?
    #     # To avoid blocking the update of the account locally ?
    #     response = adyen_shareholder.adyen_account_id._adyen_rpc(
    #         'v1/update_account_holder', self._format_data(values))

    #     # FIXME ANVFE would be more consistent if based on ACCOUNT_HOLDER_UPDATED notifications
    #     shareholders = response['accountHolderDetails']['businessDetails']['shareholders']
    #     created_shareholder = next(
    #         shareholder
    #         for shareholder in shareholders
    #         if shareholder['shareholderReference'] == adyen_shareholder.shareholder_reference)
    #     adyen_shareholder.with_context(update_from_adyen=True).write({
    #         'code': created_shareholder['shareholderCode'],
    #     })
    #     return adyen_shareholder

    # def write(self, vals):
    #     res = super().write(vals)
    #     if not self.env.context.get('update_from_adyen'):
    #         self.ensure_one()
    #         self.adyen_account_id._adyen_rpc('v1/update_account_holder', self._format_data(vals))
    #     return res

    def unlink(self):
        self.check_access_rights('unlink')

        # TODO ANVFE this call seems to support batch deletion, to try
        for shareholder in self:
            shareholder.adyen_account_id._adyen_rpc('v1/delete_shareholders', {
                'accountHolderCode': shareholder.adyen_account_id.account_holder_code,
                'shareholderCodes': [shareholder.code],
            })
        return super().unlink()

    def _handle_adyen_update_feedback(self, response):
        if not self:
            return

        shareholder_details = response['accountHolderDetails']['businessDetails']['shareholders']
        for shareholder_data in shareholder_details:
            shareholder = self.filtered(
                lambda acc: acc.shareholder_reference == shareholder_data['shareholderReference'])

            if not shareholder:
                continue  # shouldn't happen, unless data was not properly synchronized between adyen and submerchant

            shareholder_code = shareholder_data['shareholderCode']
            if shareholder.code != shareholder_code:
                shareholder.with_context(update_from_adyen=True).code = shareholder_code

    def _upload_photo_id(self, document_type, content, filename):
        self.ensure_one()
        # FIXME ANVFE wtf is this test mode config param ???
        test_mode = self.env['ir.config_parameter'].sudo().get_param('odoo_payments.test_mode')
        self.adyen_account_id._adyen_rpc('v1/upload_document', {
            'documentDetail': {
                'accountHolderCode': self.adyen_account_id.account_holder_code,
                'shareholderCode': self.code,
                'documentType': document_type,
                'filename': filename,
                'description': 'PASSED' if test_mode else '',
            },
            'documentContent': content.decode(),
        })

    # def _format_data(self, values):
    #     """

    #     :param dict values:

    #     :returns:
    #     :rtype: dict
    #     """
    #     adyen_account = self.env['adyen.account'].browse(values.get('adyen_account_id')) if values.get('adyen_account_id') else self.adyen_account_id
    #     country = self.env['res.country'].browse(values.get('country_id')) if values.get('country_id') else self.country_id
    #     state = self.env['res.country.state'].browse(values.get('owner_state_id')) if values.get('state_id') else self.state_id
    #     data = {
    #         'accountHolderCode': adyen_account.account_holder_code,
    #         'accountHolderDetails': {
    #             'businessDetails': {
    #                 'shareholders': [{
    #                     'shareholderCode': values.get('code') or self.shareholder_uuid or None,
    #                     'shareholderReference': values.get('shareholder_reference') or self.shareholder_reference,
    #                     'address': {
    #                         'city': values.get('city') or self.city,
    #                         'country': country.code,
    #                         'houseNumberOrName': values.get('house_number_or_name') or self.house_number_or_name,
    #                         'postalCode': values.get('zip') or self.zip,
    #                         'stateOrProvince': state.code or None,
    #                         'street': values.get('street') or self.street,
    #                     },
    #                     'name': {
    #                         'firstName': values.get('first_name') or self.first_name,
    #                         'lastName': values.get('last_name') or self.last_name,
    #                         'gender': 'UNKNOWN'
    #                     },
    #                     'personalData': {
    #                         'dateOfBirth': str(values.get('date_of_birth') or self.date_of_birth),
    #                     }
    #                 }]
    #             }
    #         }
    #     }

    #     # documentData cannot be present in the data if not set
    #     document_number = values.get('document_number') or self.document_number
    #     if document_number:
    #         data['accountHolderDetails']['businessDetails']['shareholders'][0]['personalData']['documentData'] = [{
    #             'number': document_number,
    #             'type': 'ID',
    #         }]

    #     return data
