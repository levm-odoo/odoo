# Part of Odoo. See LICENSE file for full copyright and licensing details.

import base64
import uuid

from odoo import _, api, fields, models
from odoo.exceptions import ValidationError
from odoo.tools.mimetypes import guess_mimetype

from odoo.addons.odoo_payments.models.adyen_kyc_check import ADYEN_KYC_STATUS
from odoo.addons.odoo_payments.models.adyen_mixins import ADYEN_AVAILABLE_COUNTRIES


class AdyenBankAccount(models.Model):
    _name = 'adyen.bank.account'
    _description = "Odoo Payments Bank Account"

    #=========== ANY FIELD BELOW THIS LINE HAS NOT BEEN CLEANED YET ===========#

    # TODO ANVFE try to use res.bank & res.partner.bank models for easier autofill ?

    adyen_account_id = fields.Many2one(
        comodel_name='adyen.account', required=True, ondelete='cascade')

    bank_account_reference = fields.Char(string='Reference', default=lambda self: uuid.uuid4().hex, required=True, readonly=True)
    bank_account_uuid = fields.Char(string='UUID', readonly=True, help="Adyen Reference")

    owner_name = fields.Char(
        string='Owner Name',
        required=True,
        help="The name of the bank account owner.")
    # FIXME ANVFE Bank account country cannot be different from address country except for EU
    # FIXME ANVFE add information on best payout currencies ?
    # https://docs.adyen.com/account/supported-currencies
    country_id = fields.Many2one(
        string='Country',
        comodel_name='res.country',
        domain=[('code', 'in', ADYEN_AVAILABLE_COUNTRIES)],
        required=True,
        help="The country in which the bank account is registered.")
    country_code = fields.Char(related='country_id.code')
    currency_id = fields.Many2one(
        string='Currency',
        comodel_name='res.currency',
        required=True,
        help="The currency in which the bank account deals.")
    currency_name = fields.Char(string='Currency Name', related='currency_id.name')
    # TODO ANVFE use base_iban to validate the iban ?
    iban = fields.Char(string='IBAN')
    account_number = fields.Char(
        string='Account Number',
        help="The bank account number (without separators).")
    branch_code = fields.Char(string='Branch Code')
    bank_city = fields.Char(
        string='Bank City', help="The city in which the bank branch is located.")
    bank_code = fields.Char(
        string='Bank Code', help="The bank code of the banking institution with which the bank account is registered.")
    bank_name = fields.Char(
        string='Bank Name', help="The name of the banking institution with which the bank account is held.")
    account_type = fields.Selection(
        string='Account Type',
        selection=[
            ('checking', 'Checking'),
            ('savings', 'Savings'),
        ], help="The type of bank account. Only applicable to bank accounts held in the USA.")

    # TODO ANVFE auto-fill owner by default with current/company partner ???
    # Or with adyen account data ?
    owner_country_id = fields.Many2one(
        comodel_name='res.country', string='Owner Country',
        help="The country of residence of the bank account owner.")
    owner_state_id = fields.Many2one(
        string='Owner State',
        comodel_name='res.country.state',
        domain="[('country_id', '=?', owner_country_id)]")
    owner_street = fields.Char(
        string='Owner Street',
        help="The street name of the residence of the bank account owner.")
    owner_city = fields.Char(
        string='Owner City',
        help="The city of residence of the bank account owner.")
    owner_zip = fields.Char(
        string='Owner ZIP',
        help="The postal code of the residence of the bank account owner.")
    owner_house_number_or_name = fields.Char(
        string='Owner House Number or Name',
        help="The house name or number of the residence of the bank account owner.")

    # FIXME ANVFE limit document to required specifications
    # https://docs.adyen.com/platforms/verification-checks/bank-account-check#requirements
    bank_statement = fields.Binary(
        string='Bank Statement',
        help="You need to provide a bank statement to allow payouts."
        "The file must be a bank statement, a screenshot of your online banking environment, "
        "a letter from the bank or a cheque and must contain the logo of the bank or it's name "
        "in a unique font, the bank account details, the name of the account holder."
        "Allowed formats: jpg, pdf, png. Maximum allowed size: 10MB.")
    bank_statement_filename = fields.Char()

    # KYC
    # adyen_kyc_ids = fields.One2many(comodel_name='adyen.kyc', inverse_name='bank_account_id')
    kyc_status = fields.Selection(selection=ADYEN_KYC_STATUS, compute='_compute_kyc_status')
    kyc_status_message = fields.Char(compute='_compute_kyc_status')

    #=== COMPUTE METHODS ===#

    #=== CONSTRAINT METHODS ===#

    #=== CRUD METHODS ===#

    #=== ACTION METHODS ===#

    #=== BUSINESS METHODS ===#

    def _prepare_bank_account_details(self):
        """ Prepare the payload for the bank account details in Adyen format.

        :return: The adyen-formatted payload for the bank account details
        :rtype: list
        """
        if not self:  # No bank account is created yet
            return None
        else:
            # Build an array of shareholder details for each existing bank account
            return [
                {
                    'accountNumber': bank_account.account_number or None,
                    'accountType': bank_account.account_type or None,
                    # 'bankAccountName': None,
                    'bankAccountReference': bank_account.bank_account_reference,
                    'bankAccountUUID': bank_account.bank_account_uuid or None,
                    # 'bankBicSwift': None,
                    'bankCity': bank_account.bank_city or None,
                    'bankCode': bank_account.bank_code or None,
                    'bankName': bank_account.bank_name or None,
                    'branchCode': bank_account.branch_code or None,
                    # 'checkCode': None,
                    'countryCode': bank_account.country_code or None,
                    'currencyCode': bank_account.currency_id.name,
                    'iban': bank_account.iban or None,
                    'ownerCity': bank_account.owner_city or None,
                    'ownerCountryCode': bank_account.owner_country_id.code or None,
                    # 'ownerDateOfBirth': None,
                    'ownerHouseNumberOrName': bank_account.owner_house_number_or_name or None,
                    'ownerName': bank_account.owner_name,
                    # 'ownerNationality': None,
                    'ownerPostalCode': bank_account.owner_zip or None,
                    'ownerState': bank_account.owner_state_id.code or None,
                    'ownerStreet': bank_account.owner_street or None,
                    # 'primaryAccount': None,
                    # 'taxId': None,
                    # 'urlForVerification': None,
                } for bank_account in self
            ]

    #=========== ANY METHOD BELOW THIS LINE HAS NOT BEEN CLEANED YET ===========#

    @api.depends_context('lang')
    # @api.depends('adyen_kyc_ids')
    def _compute_kyc_status(self):
        self.kyc_status_message = False # FIXME ANVFE when is it specified ???
        self.kyc_status = False
    #     for bank_account in self.filtered('adyen_kyc_ids'):
    #         kyc = bank_account.adyen_kyc_ids._sort_by_status()
    #         bank_account.kyc_status = kyc[0].status

    # @api.model
    # def create(self, values):
    #     adyen_bank_account = super().create(values)

    #     response = adyen_bank_account.adyen_account_id._adyen_rpc(
    #         'v1/update_account_holder', self._format_data(values))
    #     bank_accounts = response['accountHolderDetails']['bankAccountDetails']

    #     # FIXME ANVFE would be more consistent if based on ACCOUNT_HOLDER_UPDATED notifications
    #     created_bank_account = next(
    #         bank_account
    #         for bank_account in bank_accounts
    #         if bank_account['bankAccountReference'] == adyen_bank_account.bank_account_reference)
    #     adyen_bank_account.with_context(update_from_adyen=True).write({
    #         'bank_account_uuid': created_bank_account['bankAccountUUID'],
    #     })
    #     return adyen_bank_account

    def write(self, vals):
        res = super().write(vals)

        # if not self.env.context.get('update_from_adyen'):
        #     self.adyen_account_id._adyen_rpc('v1/update_account_holder', self._format_data(vals))
        if 'bank_statement' in vals:
            self._upload_bank_statement(vals['bank_statement'], vals['bank_statement_filename'])
        return res

    def unlink(self):
        unlink_data = {}
        for account in self.adyen_account_id:
            bank_accounts = self.filtered(lambda bank_account: bank_account.adyen_account_id.id == account.id)
            unlink_data[account] = bank_accounts.mapped('bank_account_uuid')

        res = super().unlink()

        for account, bank_account_uuids in unlink_data.items():
            account._adyen_rpc('v1/delete_bank_accounts', {
                'accountHolderCode': account.account_holder_code,
                'bankAccountUUIDs': bank_account_uuids,
            })

        return res

    def name_get(self):
        res = []
        for bank_account in self:
            name = f'{bank_account.owner_name} - f{bank_account.iban or bank_account.account_number}'
            res.append((bank_account.id, name))
        return res

    def _handle_adyen_update_feedback(self, response):
        if not self:
            return

        bank_accounts_details = response['accountHolderDetails']['bankAccountDetails']
        for bank_account_data in bank_accounts_details:
            bank_account = self.filtered(
                lambda acc: acc.bank_account_reference == bank_account_data['bankAccountReference'])

            if not bank_account:
                continue  # shouldn't happen, unless data was not properly synchronized between adyen and submerchant

            uuid = bank_account_data['bankAccountUUID']
            if bank_account.bank_account_uuid != uuid:
                bank_account.with_context(update_from_adyen=True).write({
                    'bank_account_uuid': uuid,
                })

    def _upload_bank_statement(self, content, filename):
        content_encoded = content.encode('utf8')
        mimetype = guess_mimetype(base64.b64decode(content_encoded))
        file_size = len(content_encoded)

        # Document requirements: https://docs.adyen.com/platforms/verification-checks/bank-account-check#requirements
        if mimetype not in ['image/jpeg', 'image/png', 'application/pdf']:
            raise ValidationError(_('Allowed file formats for bank statements are jpeg, jpg, pdf or png. Received %r instead.', mimetype))
        if file_size < (100 * 1024) or (file_size < 1024 and mimetype == 'application/pdf'):
            raise ValidationError(_('Minimum allowed size for bank statements: 1 KB for PDF, 100 KB for other formats.'))
        if file_size > (4 * 1024 * 1024):
            raise ValidationError(_('Maximum allowed size for bank statements: 4MB.'))

        # FIXME ANVFE wtf is this test mode config param ???
        test_mode = self.env['ir.config_parameter'].sudo().get_param('odoo_payments.test_mode')
        self.adyen_account_id._adyen_rpc('v1/upload_document', {
            'documentDetail': {
                'accountHolderCode': self.adyen_account_id.account_holder_code,
                'bankAccountUUID': self.bank_account_uuid,
                'documentType': 'BANK_STATEMENT',
                'filename': filename,
                'description': 'PASSED' if test_mode else '',
            },
            'documentContent': content,
        })
