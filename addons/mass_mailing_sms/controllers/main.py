# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import werkzeug
from werkzeug.exceptions import NotFound

from odoo import http, _
from odoo.addons.phone_validation.tools import phone_validation
from odoo.http import request


class MailingSMSController(http.Controller):

    def _check_trace(self, mailing_id, trace_code):
        try:
            mailing = request.env['mailing.mailing'].sudo().search([('id', '=', mailing_id)])
        except:
            mailing = False
        if not mailing:
            return {'error': 'mailing_error'}
        trace = request.env['mailing.trace'].sudo().search([
            ('trace_type', '=', 'sms'),
            ('sms_code', '=', trace_code),
            ('mass_mailing_id', '=', mailing.id)
        ])
        if not trace:
            return {'error': 'trace_error'}
        return {'trace': trace}

    @http.route(['/sms/<int:mailing_id>/<string:trace_code>'], type='http', website=True, auth='public')
    def blacklist_page(self, mailing_id, trace_code, **post):
        check_res = self._check_trace(mailing_id, trace_code)
        country_code = request.geoip.country_code
        country = request.env['res.country'].search([('code', '=', country_code)], limit=1)
        sms_number = post.get('sms_number', '').strip()
        if not check_res.get('trace'):
            return request.redirect('/odoo')

        if sms_number:
            try:
                # Sanitize the phone number
                sanitized_number = phone_validation.phone_format(
                    sms_number,
                    country.code,
                    country.phone_code,
                    force_format='E164',
                    raise_exception=True,
                )
            except Exception:  # noqa: BLE001
                sanitized_number = False

            trace = check_res['trace'][:1] if sanitized_number else False
            # Redirect if trace exists
            if trace:
                params = werkzeug.urls.url_encode({'sms_number': sanitized_number})
                return request.redirect(f'/sms/{mailing_id}/unsubscribe/{trace_code}?{params}')

            # Handle unsubscribe errors
            unsubscribe_error = _('Oops! The phone number seems to be incorrect. Please make sure to include the country code.')\
                if not sanitized_number else _('Oops! Number not found')
            return request.render('mass_mailing_sms.blacklist_main', {
                'mailing_id': mailing_id,
                'trace_code': trace_code,
                'sms_number': sms_number,
                'unsubscribe_error': unsubscribe_error,
            })

        # Render the form if no SMS number was provided
        return request.render('mass_mailing_sms.blacklist_main', {
            'mailing_id': mailing_id,
            'sms_number': post.get('sms_number', '').strip(),
            'trace_code': trace_code,
            'unsubscribe_error': post.get('unsubscribe_error', False),
        })

    @http.route(['/sms/<int:mailing_id>/unsubscribe/<string:trace_code>'], type='http', website=True, auth='public')
    def blacklist_number(self, mailing_id, trace_code, **post):
        check_res = self._check_trace(mailing_id, trace_code)
        if not check_res.get('trace'):
            return request.redirect('/odoo')
        # parse and validate number
        sms_number = post.get('sms_number', '').strip(' ')
        tocheck_number = sms_number

        trace = check_res['trace'][:1] if tocheck_number else False
        # compute opt-out / blacklist information
        lists_optout = request.env['mailing.list'].sudo()
        lists_optin = request.env['mailing.list'].sudo()
        if tocheck_number and trace:
            mailing_list_ids = trace.mass_mailing_id.contact_list_ids
            if mailing_list_ids:
                subscriptions = request.env['mailing.subscription'].sudo().search([
                    ('list_id', 'in', mailing_list_ids.ids),
                    ('contact_id.phone_sanitized', '=', tocheck_number),
                ])
                subscriptions.write({'opt_out': True})
                lists_optout = subscriptions.mapped('list_id')
            else:
                blacklist_rec = request.env['phone.blacklist'].sudo().add(tocheck_number)
                blacklist_rec._message_log(
                    body=_('Blacklist through SMS Marketing unsubscribe (mailing ID: %(mailing_id)s - model: %(model)s)',
                           mailing_id=trace.mass_mailing_id.id, model=trace.mass_mailing_id.mailing_model_id.display_name))
            lists_optin = request.env['mailing.subscription'].sudo().search([
                ('contact_id.phone_sanitized', '=', tocheck_number),
                ('list_id', 'not in', mailing_list_ids.ids),
                ('opt_out', '=', False),
            ]).mapped('list_id')

        return request.render('mass_mailing_sms.blacklist_number', {
            'mailing_id': mailing_id,
            'trace_code': trace_code,
            'sms_number': sms_number,
            'lists_optin': lists_optin,
            'lists_optout': lists_optout,
        })

    @http.route('/r/<string:code>/s/<int:sms_id_int>', type='http', auth="public")
    def sms_short_link_redirect(self, code, sms_id_int, **post):
        if sms_id_int:
            trace_id = request.env['mailing.trace'].sudo().search([('sms_id_int', '=', int(sms_id_int))]).id
        else:
            trace_id = False

        request.env['link.tracker.click'].sudo().add_click(
            code,
            ip=request.httprequest.remote_addr,
            country_code=request.geoip.country_code,
            mailing_trace_id=trace_id
        )
        redirect_url = request.env['link.tracker'].get_url_from_code(code)
        if not redirect_url:
            raise NotFound()
        return request.redirect(redirect_url, code=301, local=False)
