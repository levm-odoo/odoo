# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging

from urllib.parse import quote_plus, urljoin, urlencode

from odoo import _, models
from odoo.exceptions import UserError, ValidationError
from odoo.tools import float_round

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment_nuvei import const
from odoo.addons.payment_nuvei.controllers.main import NuveiController


_logger = logging.getLogger(__name__)


class PaymentTransaction(models.Model):
    _inherit = 'payment.transaction'

    def _get_specific_rendering_values(self, processing_values):
        """ Override of `payment` to return Nuvei-specific processing values.

        Note: self.ensure_one() from `_get_processing_values`

        :param dict processing_values: The generic processing values of the transaction.
        :return: The dict of provider-specific processing values.
        :rtype: dict
        """
        res = super()._get_specific_rendering_values(processing_values)
        if self.provider_code != 'nuvei':
            return res

        base_url = self.provider_id.get_base_url()
        return_url = urljoin(base_url, NuveiController._return_url)

        cancel_url = urljoin(base_url, NuveiController._cancel_url)
        cancel_url_params = {
            'tx_ref': self.reference,
            'return_access_tkn': payment_utils.generate_access_token(self.reference),
        }

        first_name, last_name = payment_utils.split_partner_name(self.partner_name)

        # Nuvei uses unique user references to keep track of saved payment methods.
        unique_user_ref = f'{self.partner_id.id}|{self.partner_name}'

        # Nuvei expects time sent in UTC/GMT
        timestamp = self.create_date.strftime('%Y-%m-%d.%H:%M:%S')

        # If the customer is buying something with Webpay in Chile, they expect USD transactions
        # to be in whole integer values. Therefore we must round them.
        if self.payment_method_code in const.INTEGER_METHODS:
            rounding = 0
        else:
            rounding = self.currency_id.decimal_places


        if self.payment_method_code in const.FULL_NAME_METHODS and not (first_name and last_name):
            raise UserError(
                "Nuvei: " + _(
                    "%(payment_method)s requires both a first and last name.",
                    payment_method=self.payment_method_code.capitalize()
                )
            )

        rounded_amount = float_round(self.amount, rounding, rounding_method='DOWN')
        url_params = {
            'country': self.partner_country_id.code,
            'currency': self.currency_id.name,
            'email': self.partner_email or '',
            'first_name': first_name,
            'item_amount_1': rounded_amount,
            'item_name_1': self.reference,
            'item_quantity_1': 1,
            'invoice_id': self.reference,
            'last_name': last_name,
            'merchantLocale': self.partner_lang,
            'merchant_id': self.provider_id.nuvei_merchant_identifier,
            'merchant_site_id': self.provider_id.nuvei_site_identifier,
            'payment_method_mode': 'filter',
            'payment_method': const.PAYMENT_METHODS_MAPPING.get(
                self.payment_method_code, self.payment_method_code
            ),
            'time_stamp': timestamp,
            'total_amount': rounded_amount,
            'user_token_id': unique_user_ref,
            'version': '4.0.0',
            'notify_url': urljoin(base_url, NuveiController._webhook_url),
            'success_url': return_url,
            'error_url': return_url,
            'pending_url': return_url,
            'back_url': f'{cancel_url}?{urlencode(cancel_url_params)}',
        }

        # Phone numbers need to standardized and validated.
        phone_number = self.partner_phone and self._phone_format(
            number=self.partner_phone, country=self.partner_country_id, raise_exception=False
        )

        if phone_number:
            url_params['phone1'] = phone_number
        if self.partner_address:
            url_params['address1'] = self.partner_address
        if self.partner_city:
            url_params['city'] = self.partner_city
        if self.partner_zip:
            url_params['zip'] = self.partner_zip
        if self.partner_state_id.code:
            url_params['state'] = self.partner_state_id.code

        def quote_value(value):
            # Any string containing non-ascii characters need to be quoted for Nuvei to properly
            # handle it, this is required as the checksum needs to be encoded in the same way.
            # We don't encode standard ascii strings because it breaks the URL info and datetime
            # data on Nuvei's side.
            if isinstance(value, str) and not value.isascii():
                value = quote_plus(value)
            return value

        url_params = {key: quote_value(value) for key, value in url_params.items()}
        checksum = self.provider_id._nuvei_calculate_signature(url_params, incoming=False)
        rendering_values = {
            'api_url': self.provider_id._nuvei_get_api_url(),
            'checksum': checksum,
            'url_params': url_params,
        }
        return rendering_values

    def _get_tx_from_notification_data(self, provider_code, notification_data):
        """ Override of `payment` to find the transaction based on Nuvei data.

        :param str provider_code: The code of the provider that handled the transaction.
        :param dict notification_data: The notification data sent by the provider.
        :return: The transaction if found.
        :rtype: recordset of `payment.transaction`
        :raise ValidationError: If inconsistent data are received.
        :raise ValidationError: If the data match no transaction.
        """
        tx = super()._get_tx_from_notification_data(provider_code, notification_data)
        if provider_code != 'nuvei' or len(tx) == 1:
            return tx
        reference = notification_data.get('invoice_id')
        if not reference:
            raise ValidationError(
                "Nuvei: " + _("Received data with missing reference %(ref)s.", ref=reference)
            )

        tx = self.search([('reference', '=', reference), ('provider_code', '=', 'nuvei')])
        if not tx:
            raise ValidationError(
                "Nuvei: " + _("No transaction found matching reference %s.", reference)
            )

        return tx

    def _process_notification_data(self, notification_data):
        """ Override of `payment' to process the transaction based on Nuvei data.

        Note: self.ensure_one()

        :param dict notification_data: The notification data sent by the provider.
        :return: None
        :raise ValidationError: If inconsistent data are received.
        """
        super()._process_notification_data(notification_data)

        if self.provider_code != 'nuvei':
            return

        if not notification_data:
            self._set_canceled(state_message=_("The customer left the payment page."))
            return

        # Update the provider reference.
        self.provider_reference = notification_data.get('TransactionID')

        # Update the payment method.
        payment_option = notification_data.get('payment_method', '')
        payment_method = self.env['payment.method']._get_from_code(
            payment_option.lower(), mapping=const.PAYMENT_METHODS_MAPPING
        )
        self.payment_method_id = payment_method or self.payment_method_id

        # Update the payment state.
        status = notification_data.get('Status')
        if not status:
            raise ValidationError("Nuvei: " + _("Received data with missing payment state."))
        status = status.lower()
        if status in const.PAYMENT_STATUS_MAPPING['pending']:
            self._set_pending()
        elif status in const.PAYMENT_STATUS_MAPPING['done']:
            self._set_done()
        elif status in const.PAYMENT_STATUS_MAPPING['error']:
            failure_reason = notification_data.get('Reason')
            self._set_error(_(
                "An error occurred during the processing of your payment (%s). Please try again.",
                failure_reason,
            ))
        else:  # Classify unsupported payment state as `error` tx state.
            status_description = notification_data.get('Reason')
            _logger.info(
                "Received data with invalid payment status (%(status)s) and reason '%(reason)s' "
                "for transaction with reference %(ref)s",
                {'status': status, 'reason': status_description, 'ref': self.reference},
            )
            self._set_error("Nuvei: " + _(
                "Received invalid transaction status %(status)s and reason '%(reason)s'.",
                status=status, reason=status_description
            ))
