import logging
from hashlib import sha256
import hmac

from odoo import _, api
from odoo.addons.hr_expense_stripe.utils import API_VERSION, format_amount_from_stripe
from odoo.exceptions import ValidationError
from odoo.http import Controller, request, route
from odoo.tools.safe_eval import time

_logger = logging.getLogger(__name__)

class StripeIssuingController(Controller):
    _webhook_url='/stripe_issuing/webhook'

    @route(_webhook_url, type='http', methods=['POST'], auth='public', csrf=False)
    def stripe_issuing_webhook(self):
        event = request.get_json_data()
        _logger.debug(event)  # TODO JUAL: Remove
        valid_company = False
        for company_sudo in request.env['res.company'].sudo().search([('stripe_webhook_secret', '!=', False)]):
            if self._validate_signature(
                    company_sudo.stripe_webhook_secret,
                    request.httprequest.headers.get('Stripe-Signature'),
                    request.httprequest.get_data(as_text=True),
            ):
                valid_company = company_sudo.sudo(self.env.su)
                break

        if not valid_company:
            raise ValidationError(_("Invalid or outdated signature found in the request"))

        headers = {"Stripe-Version": API_VERSION, "Content-Type": "application/json"}
        response = {'approved': False}
        try:
            match event['type'].split('.'):
                case ('issuing_authorization', 'request'):
                    response = self._process_authorization_event(event)
                case ('issuing_transaction', 'created'):
                    response = self._process_transaction_event(event)
                case ('issuing_card', _trash):
                    response = self._process_card_event(event)
                case ('issuing_cardholder', _trash):
                    response = self._process_cardholder_event(event)
                case _:
                    raise ValidationError(_("Invalid event type '%(invalid_event)s'", invalid_event=event['type']))

        except ValidationError as e:
            _logger.exception("Error while processing the request: %s", e)
        return request.make_json_response(data=response, headers=headers, status=200)

    # --------------------------------------------
    # Events processing methods
    # --------------------------------------------
    @api.model
    def _process_authorization_event(self, event):
        auth_object = event['data']['object']
        _logger.debug('Processing Stripe Authorization event: %s', event)

        card = request.env['hr.expense.stripe.credit.card'].search([('stripe_id', '=', auth_object['card']['id'])], limit=1)
        if not card:
            raise ValidationError(_("A card that doesn't exist on the database was used"))
        amount = format_amount_from_stripe(auth_object['amount'], card.currency_id)
        if card._can_pay_amount(amount, auth_object['merchant_data']):
            return {'approved': True}
        else:
            return {'approved': False}

    @api.model
    def _process_transaction_event(self, event):
        tr_object = event['data']['object']
        _logger.debug('Processing Stripe transaction event: %s', event)
        if tr_object['type'] == 'capture':
            self._create_expense_from_transaction(tr_object)
        elif tr_object['type'] == 'refund':
            self._cancel_expense_or_reverse_move(tr_object)
        return {}

    @api.model
    def _process_card_event(self, event):
        card_object = event['data']['object']
        if event['type'] in {'issuing_card.created', 'issuing_card.updated'}:
            existing_card = request.env['hr.expense.stripe.credit.card'].search([('stripe_id', '=', card_object['card']['id'])], limit=1)
            existing_cardholder = request.env['hr.employee'].search([('stripe_id', '=', card_object['card']['cardholder'])], limit=1)
            if existing_card:
                existing_card.with_company(existing_card.company_id)._update_from_stripe(card_object)
            elif existing_cardholder:
                env = request.env.with_company(existing_cardholder.company_id)
                env['hr.expense.stripe.credit.card']._create_from_stripe([card_object])
            else:
                cardholder = request.env['hr.employee']._create_from_stripe([{'stripe_id': card_object['card']['cardholder']}])
                if not cardholder:
                    raise ValidationError(_("Cannot match the cardholder to an existing employee"))
                env = request.env.with_company(cardholder.company_id)
                card_object['cardholder'] = {'id': cardholder.stripe_id, 'email': cardholder.work_email or cardholder.email}
                env['hr.expense.stripe.credit.card']._create_from_stripe([card_object])
        return {}

    def process_cardholder_event(self, event):
        cardholder_object = event['data']['object']
        if event['type'] in {'issuing_cardholder.created', 'issuing_cardholder.updated'}:
            existing_cardholder = request.env['hr.employee'].search([('stripe_id', '=', cardholder_object['card']['cardholder'])], limit=1)
            if not existing_cardholder:
                new_employee = request.env['hr.employee']._create_from_stripe(cardholder_object)
                if not new_employee:
                    raise ValidationError(_("Cannot match the cardholder to an existing employee"))
        return {}

    # --------------------------------------------
    # Helpers
    # --------------------------------------------
    @api.model
    def _validate_signature(self, company_secret, signature_header, payload):
        if not signature_header:
            return False
        _logger.info('Validating signature: %s', signature_header)  # TODO JUAL: Remove
        signature_data = {
            key: value
            for key_value in signature_header.split(',')
            for key, value in key_value.split('=')
            if key_value
        }
        _logger.info('Validating signature: %s', signature_data)  # TODO JUAL: Remove

        if (time.time() - int(signature_data['t'])) > 300:  # 5 minutes
            return False

        signed_payload = f"{signature_data['t']}.{payload}"
        print(signed_payload)
        return signature_data['v1'] == hmac.new(company_secret.encode(),  signed_payload.encode(), sha256).hexdigest()

    @api.model
    def _create_expense_from_transaction(self, tr_object):
        merchant_data = tr_object['merchant_data']
        card = request.env['hr.expense.stripe.credit.card'].search([('stripe_id', '=', tr_object['card']['id'])], limit=1)
        if not card:
            raise ValidationError(_("A card that doesn't exist on the database was used"))
        env = request.env.with_company(card.company_id)
        card = card.with_company(card.company_id)
        domain = [
            ('can_be_expensed', '=', True), '|', ('mcc_ids', '=', merchant_data['merchant_code']), ('mcc', '=', False)
        ]
        product = env['product.product'].search(domain, limit=2).ordered(lambda product: not product.mcc_ids)[:1]
        vendor = env['res.partner'].search(
            domain=[
                ('country_id.code', '=like', merchant_data['country']),
                ('city', '=like', merchant_data['city']),
                ('state_id.code', '=like', merchant_data['state']),
                ('zip', '=', merchant_data['postal_code']),
            ],
            limit=1,
        )
        if not vendor:
            country = env['res.country'].search([('code', '=like', merchant_data['country'])], limit=1)
            state = env['res.country.state'].search(
                domain=[('code', '=like', merchant_data['state'], ('country_id', '=', country.id))],
                limit=1,
            )
            vendor = env['res.partner'].create(
                {
                    'name': merchant_data['name'],
                    'city': merchant_data['city'],
                    'state_id': state and state.id,
                    'country_id': country and country.id,
                    'postal_code': merchant_data['postal_code'],
                }
            )
        amount_company_currency = -format_amount_from_stripe(tr_object['amount'], card.currency_id)
        create_dict = {
            'payment_mode': 'company_account',
            'name': _(
                "%(employee_name)s payment to \"%(merchant_name)s\"",
                employee_name=card.employee_id.name,
                merchant_name=merchant_data['merchant_name']
            ),
            'employee_id': card.cardholder_id.id,
            'card': card.id,
            'manager_id': False,
            'stripe_authorization_id': tr_object['authorization'],
            'stripe_transaction_id': tr_object['id'],
            'product_id': product.id,
            'total_amount': amount_company_currency,
            'total_amount_currency': amount_company_currency,  # If company currency
            'vendor_id': vendor and vendor.id,
        }
        foreign_currency = env['res.currency'].with_context(active_test=False).search(
            [('name', '=', tr_object['merchant_currency'].upper())],
            limit=1,
        )
        if foreign_currency:
            if not foreign_currency.active:
                foreign_currency.active = True
            amount_foreign_currency = -format_amount_from_stripe(tr_object['merchant_amount'], foreign_currency)
            create_dict['total_amount_currency'] = amount_foreign_currency,
        expense = env['hr.expense'].with_company(card.company_id).create([create_dict])
        expense._do_submit()  # Should auto-validate

    @api.model
    def _cancel_expense_or_reverse_move(self, tr_object):
        expense = request.env['hr.expense'].search([('stripe_transaction_id', '=', tr_object['id'])], limit=1)
        if not expense:
            raise ValidationError(_("Credits are not implemented"))
        env = request.env.with_company(expense.company_id)
        expense = expense.with_company(expense.company_id)

        transaction_amount = -format_amount_from_stripe(tr_object['amount'], expense.company_currency_id)
        transaction_amount_in_currency = -format_amount_from_stripe(tr_object['merchant_amount'], expense.currency_id)
        remaining_amount = expense.total_amount - transaction_amount
        remaining_amount_in_currency = expense.total_amount_currency - transaction_amount_in_currency
        if expense:
            move = expense.account_move_id
            if move:
                move._reverse_moves(cancel=True)
            expense._do_refuse(_("Expense was refunded by vendor"))
            if not expense.company_currency_id.is_zero(remaining_amount):
                new_expense = expense.copy({
                    'manager_id': False,
                    'stripe_transaction_id': tr_object['id'],
                    'total_amount': remaining_amount,
                    'total_amount_currency': remaining_amount_in_currency
                })
                new_expense._do_submit()  # Should auto-validate
