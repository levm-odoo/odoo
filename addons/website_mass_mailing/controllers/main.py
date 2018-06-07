# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
from odoo import http
from odoo.http import route, request

class MassMailController(http.Controller):

    @route('/website_mass_mailing/is_subscriber', type='json', website=True, auth="public")
    def is_subscriber(self, list_id, **post):
        email = None
        if not request.env.user._is_public():
            email = request.env.user.email
        elif request.session.get('mass_mailing_email'):
            email = request.session['mass_mailing_email']

        is_subscriber = False
        if email:
            contacts = request.env['mail.mass_mailing.contact'].sudo().search([('list_ids', 'in', [int(list_id)]), ('email', '=', email)])
            opt_in_contacts = contacts.filtered(lambda r: r.state == 'confirmed')
            is_subscriber = len(opt_in_contacts) > 0

        return {'is_subscriber': is_subscriber, 'email': email}

    @route('/website_mass_mailing/subscribe', type='json', website=True, auth="public")
    def subscribe(self, list_id, email, **post):
        Contacts = request.env['mail.mass_mailing.contact'].sudo()
        name, email = Contacts.get_name_email(email)

        contact_ids = Contacts.search([
            ('list_ids', 'in', [int(list_id)]),
            ('email', '=', email),
        ], limit=1)
        if not contact_ids:
            # inline add_to_list as we've already called half of it
            Contacts.create({'name': name, 'email': email, 'list_ids': [(6,0,[int(list_id)])]})
        elif contact_ids.state != 'confirmed':
            contact_ids.state = 'confirmed'
        # add email to session
        request.session['mass_mailing_email'] = email
        return True

    @route(['/website_mass_mailing/get_content'], type='json', website=True, auth="public")
    def get_mass_mailing_content(self, newsletter_id, **post):
        data = self.is_subscriber(newsletter_id, **post)
        mass_mailing_list = request.env['mail.mass_mailing.list'].sudo().browse(int(newsletter_id))
        data['content'] = mass_mailing_list.popup_content,
        data['redirect_url'] = mass_mailing_list.popup_redirect_url
        return data
