# Part of Odoo. See LICENSE file for full copyright and licensing details.

import urllib.parse
import werkzeug

from odoo import _, http
from odoo.exceptions import UserError, ValidationError
from odoo.http import request

from odoo.addons.payment import utils as payment_utils
from odoo.addons.payment.controllers.post_processing import PaymentPostProcessing
from odoo.addons.portal.controllers import portal


class PaymentPortal(portal.CustomerPortal):

    """ This controller contains the foundations for online payments through the portal.

    It allows to complete a full payment flow without the need of going though a document-based flow
    made available by another module's controller.

    Such controllers should extend this one to gain access to the _create_transaction static method
    that implements the creation of a transaction before its processing, or to override specific
    routes and change their behavior globally (e.g. make the /pay route handle sale orders).

    The following routes are exposed:
    - `/payment/pay` allows for arbitrary payments.
    - `/my/payment_method` allows the user to create and delete tokens. It's its own `landing_route`
    - `/payment/transaction` is the `transaction_route` for the standard payment flow. It creates a
      draft transaction, and return the processing values necessary for the completion of the
      transaction.
    - `/payment/confirmation` is the `landing_route` for the standard payment flow. It displays the
      payment confirmation page to the user when the transaction is validated.
    - `/payment/validation` is the `validation_route` for the standard payment method validation
      flow. It redirects the user to `/my/payment_method` in order to display the result and allow
      to start the flow over.
    """

    @http.route(
        '/payment/pay', type='http', methods=['GET'], auth='public', website=True, sitemap=False,
    )
    def payment_pay(
        self, reference=None, amount=None, currency_id=None, partner_id=None, company_id=None,
        acquirer_id=None, access_token=None, **kwargs
    ):
        """ Display the payment form with optional filtering of payment options.

        The filtering takes place on the basis of provided parameters, if any. If a parameter is
        incorrect or malformed, it is skipped to avoid preventing the user from making the payment.

        In addition to the desired filtering, a second one ensures that none of the following
        rules is broken:
            - Public users are not allowed to save their payment method as a token.
            - Payments made by public users should either *not* be made on behalf of a specific
              partner or have an access token validating the partner, amount and currency.
        We let access rights and security rules do their job for logged in users.

        :param str reference: The custom prefix to compute the full reference
        :param str amount: The amount to pay
        :param str currency_id: The desired currency, as a `res.currency` id
        :param str partner_id: The partner making the payment, as a `res.partner` id
        :param str company_id: The related company, as a `res.company` id
        :param str acquirer_id: The desired acquirer, as a `payment.acquirer` id
        :param str access_token: The access token used to authenticate the partner
        :param dict kwargs: Optional data. This parameter is not used here
        :return: The rendered checkout form
        :rtype: str
        :raise: werkzeug.exceptions.NotFound if the access token is invalid
        """
        # Cast numeric parameters as int or float and void them if their str value is malformed
        currency_id, acquirer_id, partner_id, company_id = tuple(map(
            self.cast_as_int, (currency_id, acquirer_id, partner_id, company_id)
        ))
        amount = self.cast_as_float(amount)

        # Raise an HTTP 404 if a partner is provided with an invalid access token
        if partner_id:
            if not payment_utils.check_access_token(access_token, partner_id, amount, currency_id):
                raise werkzeug.exceptions.NotFound  # Don't leak info about the existence of an id

        user_sudo = request.env.user
        logged_in = not user_sudo._is_public()
        # If the user is logged in, take their partner rather than the partner set in the params.
        # This is something that we want, since security rules are based on the partner, and created
        # tokens should not be assigned to the public user. This should have no impact on the
        # transaction itself besides making reconciliation possibly more difficult (e.g. The
        # transaction and invoice partners are different).
        partner_is_different = False
        if logged_in:
            partner_is_different = partner_id and partner_id != user_sudo.partner_id.id
            partner_sudo = user_sudo.partner_id
        else:
            partner_sudo = request.env['res.partner'].sudo().browse(partner_id).exists()
            if not partner_sudo:
                return request.redirect(
                    # Escape special characters to avoid loosing original params when redirected
                    f'/web/login?redirect={urllib.parse.quote(request.httprequest.full_path)}'
                )

        # Instantiate transaction values to their default if not set in parameters
        reference = reference or payment_utils.singularize_reference_prefix(prefix='tx')
        amount = amount or 0.0  # If the amount is invalid, set it to 0 to stop the payment flow
        company_id = company_id or partner_sudo.company_id.id or user_sudo.company_id.id
        currency_id = currency_id or request.env['res.company'].browse(company_id).currency_id.id

        # Make sure that the currency exists and is active
        currency = request.env['res.currency'].browse(currency_id).exists()
        if not currency or not currency.active:
            raise werkzeug.exceptions.NotFound  # The currency must exist and be active

        # Select all acquirers and tokens that match the constraints
        acquirers_sudo = request.env['payment.acquirer'].sudo()._get_compatible_acquirers(
            company_id, partner_sudo.id, currency_id=currency.id, preferred_acquirer_id=acquirer_id
        )  # In sudo mode to read the fields of acquirers and partner (if not logged in)
        payment_tokens = request.env['payment.token'].search(
            [('acquirer_id', 'in', acquirers_sudo.ids), ('partner_id', '=', partner_sudo.id)]
        ) if logged_in else request.env['payment.token']  #

        # Compute the fees taken by acquirers supporting the feature
        fees_by_acquirer = {
            acq_sudo: acq_sudo._compute_fees(amount, currency, partner_sudo.country_id)
            for acq_sudo in acquirers_sudo.filtered('fees_active')
        }

        # Generate a new access token in case the partner id or the currency id was updated
        access_token = payment_utils.generate_access_token(partner_sudo.id, amount, currency.id)

        rendering_context = {
            'acquirers': acquirers_sudo,
            'tokens': payment_tokens,
            'fees_by_acquirer': fees_by_acquirer,
            'show_tokenize_input': logged_in,  # Prevent public partner from saving payment methods
            'reference_prefix': reference,
            'amount': amount,
            'currency': currency,
            'partner_id': partner_sudo.id,
            'access_token': access_token,
            'transaction_route': '/payment/transaction',
            'landing_route': '/payment/confirmation',
            'partner_is_different': partner_is_different,
            **self._get_custom_rendering_context_values(**kwargs),
        }
        return request.render('payment.pay', rendering_context)

    @http.route('/my/payment_method', type='http', methods=['GET'], auth='user', website=True)
    def payment_method(self, **kwargs):
        """ Display the form to manage payment methods.

        :param dict kwargs: Optional data. This parameter is not used here
        :return: The rendered manage form
        :rtype: str
        """
        partner = request.env.user.partner_id
        acquirers_sudo = request.env['payment.acquirer'].sudo()._get_compatible_acquirers(
            request.env.company.id, partner.id, force_tokenization=True
        )
        tokens = set(partner.payment_token_ids).union(
            partner.commercial_partner_id.sudo().payment_token_ids
        )  # Show all partner's tokens, regardless of which acquirer is available
        access_token = payment_utils.generate_access_token(partner.id, None, None)
        rendering_context = {
            'acquirers': acquirers_sudo,
            'tokens': tokens,
            'reference_prefix': payment_utils.singularize_reference_prefix(prefix='validation'),
            'partner_id': partner.id,
            'access_token': access_token,
            'transaction_route': '/payment/transaction',
            'validation_route': '/payment/validation',
            'landing_route': '/my/payment_method',
            **self._get_custom_rendering_context_values(**kwargs),
        }
        return request.render('payment.payment_methods', rendering_context)

    def _get_custom_rendering_context_values(self, **kwargs):
        """ Return a dict of additional rendering context values.

        :param dict kwargs: Optional data. This parameter is not used here
        :return: The dict of additional rendering context values
        :rtype: dict
        """
        return {}

    @http.route('/payment/transaction', type='json', auth='public')
    def payment_transaction(self, amount, currency_id, partner_id, access_token, **kwargs):
        """ Create a draft transaction and return its processing values.

        :param float|None amount: The amount to pay in the given currency.
                                  None if in a payment method validation operation
        :param int|None currency_id: The currency of the transaction, as a `res.currency` id.
                                     None if in a payment method validation operation
        :param int partner_id: The partner making the payment, as a `res.partner` id
        :param str access_token: The access token used to authenticate the partner
        :param dict kwargs: Locally unused data passed to `_create_transaction`
        :return: The mandatory values for the processing of the transaction
        :rtype: dict
        :raise: ValidationError if the access token is invalid
        """
        # Check the access token against the transaction values
        amount = amount and float(amount)  # Cast as float in case the JS stripped the '.0'
        if not payment_utils.check_access_token(access_token, partner_id, amount, currency_id):
            raise ValidationError(_("The access token is invalid."))

        kwargs.pop('custom_create_values', None)  # Don't allow passing arbitrary create values
        tx_sudo = self._create_transaction(
            amount=amount, currency_id=currency_id, partner_id=partner_id, **kwargs
        )

        # The generic validation and landing routes require the tx id and access token to be
        # provided, since there is no document to rely on. The access token is recomputed in case
        # we are dealing with a validation transaction (acquirer-specific amount and currency).
        access_token = payment_utils.generate_access_token(
            tx_sudo.partner_id.id, tx_sudo.amount, tx_sudo.currency_id.id
        )
        tx_sudo.validation_route = tx_sudo.validation_route \
                                   and f'{tx_sudo.validation_route}&access_token={access_token}'
        tx_sudo.landing_route = f'{tx_sudo.landing_route}' \
                                f'?tx_id={tx_sudo.id}&access_token={access_token}'

        return tx_sudo._get_processing_values()

    def _create_transaction(
        self, payment_option_id, reference_prefix, amount, currency_id, partner_id, flow,
        tokenization_requested, validation_route, landing_route, custom_create_values=None, **kwargs
    ):
        """ Create a draft transaction based on the payment context and return it.

        :param int payment_option_id: The payment option handling the transaction, as a
                                      `payment.acquirer` id or a `payment.token` id
        :param str reference_prefix: The custom prefix to compute the full reference
        :param float|None amount: The amount to pay in the given currency.
                                  None if in a payment method validation operation
        :param int|None currency_id: The currency of the transaction, as a `res.currency` id.
                                     None if in a payment method validation operation
        :param int partner_id: The partner making the payment, as a `res.partner` id
        :param str flow: The online payment flow of the transaction: 'redirect', 'direct' or 'token'
        :param bool tokenization_requested: Whether the user requested that a token is created
        :param str validation_route: The route the user is redirected to in order to refund a
                                     validation transaction
        :param str landing_route: The route the user is redirected to after the transaction
        :param dict custom_create_values: Additional create values overwriting the default ones
        :param dict kwargs: Locally unused data passed to `_is_tokenization_required` and
                            `_compute_reference`
        :return: The sudoed transaction that was created
        :rtype: recordset of `payment.transaction`
        :raise: UserError if the flow is invalid
        """
        # Prepare create values
        if flow in ['redirect', 'direct']:  # Direct payment or payment with redirection
            acquirer_sudo = request.env['payment.acquirer'].sudo().browse(payment_option_id)
            token_id = None
            tokenization_required_or_requested = acquirer_sudo._is_tokenization_required(
                provider=acquirer_sudo.provider, **kwargs
            ) or tokenization_requested
            tokenize = bool(
                # Public users are not allowed to save tokens as their partner is unknown
                not request.env.user._is_public()
                # Don't tokenize if the user tried to force it through the browser's developer tools
                and acquirer_sudo.allow_tokenization
                # Token is only created if required by the flow or requested by the user
                and tokenization_required_or_requested
            )
        elif flow == 'token':  # Payment by token
            token_sudo = request.env['payment.token'].sudo().browse(payment_option_id)
            acquirer_sudo = token_sudo.acquirer_id
            token_id = payment_option_id
            tokenize = False
        else:
            raise UserError(
                _("The payment should either be direct, with redirection, or made by a token.")
            )
        reference = request.env['payment.transaction']._compute_reference(
            acquirer_sudo.provider,
            prefix=reference_prefix,
            **(custom_create_values or {}),
            **kwargs
        )
        if validation_route:  # Acquirers determine the amount and currency in validation operations
            amount = acquirer_sudo._get_validation_amount()
            currency_id = acquirer_sudo._get_validation_currency().id

        # Create the transaction
        tx_sudo = request.env['payment.transaction'].sudo().create({
            'acquirer_id': acquirer_sudo.id,
            'reference': reference,
            'amount': amount,
            'currency_id': currency_id,
            'partner_id': partner_id,
            'token_id': token_id,
            'operation': f'online_{flow}' if not validation_route else 'validation',
            'tokenize': tokenize,
            'validation_route': validation_route,
            'landing_route': landing_route,
            **(custom_create_values or {}),
        })  # In sudo mode to allow writing on callback fields
        # Validation routes require the transaction id
        tx_sudo.validation_route = validation_route and f'{validation_route}?tx_id={tx_sudo.id}'

        if flow == 'token':
            tx_sudo._send_payment_request()  # Payments by token process transactions immediately
        else:
            tx_sudo._log_sent_message()

        # Monitor the transaction to make it available in the portal
        PaymentPostProcessing.monitor_transactions(tx_sudo)

        return tx_sudo

    @http.route('/payment/confirmation', type='http', methods=['GET'], auth='public', website=True)
    def payment_confirm(self, tx_id, access_token, **kwargs):
        """ Display the payment confirmation page with the appropriate status message to the user.

        :param str tx_id: The transaction to confirm, as a `payment.transaction` id
        :param str access_token: The access token used to verify the user
        :param dict kwargs: Optional data. This parameter is not used here
        :raise: werkzeug.exceptions.NotFound if the access token is invalid
        """
        tx_id = self.cast_as_int(tx_id)
        if tx_id:
            tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id)

            # Raise an HTTP 404 if the access token is invalid
            if not payment_utils.check_access_token(
                access_token, tx_sudo.partner_id.id, tx_sudo.amount, tx_sudo.currency_id.id
            ):
                raise werkzeug.exceptions.NotFound  # Don't leak info about existence of an id

            # Fetch the appropriate status message configured on the acquirer
            if tx_sudo.state == 'draft':
                status = 'info'
                message = tx_sudo.state_message \
                          or _("This payment has not been processed yet.")
            elif tx_sudo.state == 'pending':
                status = 'warning'
                message = tx_sudo.acquirer_id.pending_msg
            elif tx_sudo.state in ('authorized', 'done'):
                status = 'success'
                message = tx_sudo.acquirer_id.done_msg
            else:
                status = 'danger'
                message = tx_sudo.state_message \
                          or _("An error occurred during the processing of this payment.")

            # Display the payment confirmation page to the user
            PaymentPostProcessing.remove_transactions(tx_sudo)
            render_values = {
                'tx': tx_sudo,
                'status': status,
                'message': message
            }
            return request.render('payment.confirm', render_values)
        else:
            # Display the portal homepage to the user
            return request.redirect('/my/home')

    @http.route('/payment/validation', type='http', methods=['GET'], auth='user', website=True)
    def payment_validation_transaction(self, tx_id, access_token):
        """ Refund a validation transaction and redirect the user to the landing route.

        :param str tx_id: The validation transaction, as a `payment.transaction` id
        :param str access_token: The access token used to verify the user
        """
        # Raise an HTTP 404 if the tx id or the access token is invalid
        tx_id = self.cast_as_int(tx_id)
        tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
        if not tx_sudo or not payment_utils.check_access_token(
            access_token, tx_sudo.partner_id.id, tx_sudo.amount, tx_sudo.currency_id.id
        ):
            raise werkzeug.exceptions.NotFound  # Don't leak info about existence of an id

        self._refund_validation_transaction(tx_id)
        return request.redirect(tx_sudo.landing_route)

    def _refund_validation_transaction(self, tx_id):
        """ Refund a validation transaction and remove it from post-processing.

        :param str tx_id: The validation transaction to refund, as a `payment.transaction` id
        :return: The refunded transaction
        :rtype: recordset of `payment.transaction`
        :raise: ValidationError if the transaction id is invalid
        """
        tx_id = self.cast_as_int(tx_id)
        tx_sudo = request.env['payment.transaction'].sudo().browse(tx_id).exists()
        if not tx_sudo:
            raise werkzeug.exceptions.NotFound

        if tx_sudo.operation == 'validation':  # Don't allow to refund non-validation transactions
            tx_sudo._send_refund_request()

<<<<<<< HEAD
        PaymentPostProcessing.remove_transactions(tx_sudo)
=======
        render_values = {
            'partner_id': partner_id,
            'type': tx.type,
        }
>>>>>>> f05238dcb17... temp

        return tx_sudo

    @staticmethod
    def cast_as_int(str_value):
        """ Cast a string as an `int` and return it.

        If the conversion fails, `None` is returned instead.

        :param str str_value: The value to cast as an `int`
        :return: The casted value, possibly replaced by None if incompatible
        :rtype: int|None
        """
        try:
            return int(str_value)
        except (TypeError, ValueError, OverflowError):
            return None

    @staticmethod
    def cast_as_float(str_value):
        """ Cast a string as a `float` and return it.

        If the conversion fails, `None` is returned instead.

        :param str str_value: The value to cast as a `float`
        :return: The casted value, possibly replaced by None if incompatible
        :rtype: float|None
        """
        try:
            return float(str_value)
        except (TypeError, ValueError, OverflowError):
            return None
