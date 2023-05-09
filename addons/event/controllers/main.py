# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json

from werkzeug.exceptions import NotFound, Forbidden

from odoo import _
from odoo.http import Controller, request, route, content_disposition
from odoo.tools import consteq


class EventController(Controller):

    @route(['''/event/<model("event.event"):event>/ics'''], type='http', auth="public")
    def event_ics_file(self, event, **kwargs):
        if request.env.user._is_public():
            frontend_lang = request.httprequest.cookies.get('frontend_lang')
            if frontend_lang:
                event = event.with_context(lang=frontend_lang)
        files = event._get_ics_file()
        if not event.id in files:
            return NotFound()
        content = files[event.id]
        return request.make_response(content, [
            ('Content-Type', 'application/octet-stream'),
            ('Content-Length', len(content)),
            ('Content-Disposition', content_disposition('%s.ics' % event.name))
        ])

<<<<<<< HEAD
    @route(['/event/<int:event_id>/my_tickets'], type='http', auth='public')
    def event_my_tickets(self, event_id, registration_ids, tickets_hash, badge_mode=False, responsive_html=False):
        """ Returns a pdf response, containing all tickets for attendees in registration_ids for event_id.

        Throw Forbidden if no registration is valid / hash is invalid / parameters are missing.
        This route is used in links in emails to attendees, as well as in registration confirmation screens.

        :param event: the id of prompted event. Only its attendees will be considered.
        :param registration_ids: ids of event.registrations of which tickets are generated
        :param tickets_hash: string hash used to access the tickets.
        :param badge_mode: boolean, True to use template of foldable badge instead of full page ticket.
        :param responsive_html: boolean, True if we want to see the a responsive html ticket.
        """
        registration_ids = json.loads(registration_ids or '[]')
        if not event_id or not tickets_hash or not registration_ids:
            raise NotFound()

        # We sudo the event in case of invitations sent before publishing it.
        event_sudo = request.env['event.event'].browse(event_id).exists().sudo()
        hash_truth = event_sudo and event_sudo._get_tickets_access_hash(registration_ids)
        if not consteq(tickets_hash, hash_truth):
            raise NotFound()

        event_registrations_sudo = event_sudo.registration_ids.filtered(lambda reg: reg.id in registration_ids)
        report_name_prefix = _("Ticket") if responsive_html else _("Badges") if badge_mode else _("Tickets")
        report_name = f"{report_name_prefix} - {event_sudo.name} ({event_sudo.date_begin_located})"
        if len(event_registrations_sudo) == 1:
            report_name += f" - {event_registrations_sudo[0].name}"

        # sudo is necessary for accesses in templates.
        if responsive_html:
            html = request.env['ir.actions.report'].sudo()._render_qweb_html(
                'event.action_report_event_registration_responsive_html_ticket',
                event_registrations_sudo.ids,
            )[0]
            return request.make_response(html)

        pdf = request.env['ir.actions.report'].sudo()._render_qweb_pdf(
            'event.action_report_event_registration_foldable_badge' if badge_mode else
            'event.action_report_event_registration_full_page_ticket',
            event_registrations_sudo.ids,
        )[0]
        pdfhttpheaders = [
            ('Content-Type', 'application/pdf'),
            ('Content-Length', len(pdf)),
            ('Content-Disposition', content_disposition(f'{report_name}.pdf')),
        ]
        return request.make_response(pdf, headers=pdfhttpheaders)
=======
    @route(['''/event/tickets_dl'''], type='http', auth="public")
    def event_tickets_dl(self, dl_hash, event_id, registration_ids, badge_mode=False, simplified=False):
        """ Returns a pdf response, containing all tickets for attendees in registration_ids for event_id.
        They can be filtered out based on conditions in `_fetch_registrations_for_event_tickets_dl`
        Throw Forbidden if no registration is valid / hash is invalid / parameters are missing.
        This route is used in links in emails to attendees, as well as in registration confirmation screens.

        :param dl_hash: string hash used to access the tickets.
        :param event_id: the id of the prompted event. Only its attendees will be considered.
        :param registration_ids: ids of event.registrations of which tickets are generated
        :param badge_mode: boolean, True to use template of foldable badge instead of full page ticket.
        :param simplified: boolean, True if we want to see the a simplified ticket in a size-adaptative html page.
        """
        event_id = int(event_id) if event_id else False
        registration_ids = json.loads(registration_ids or '[]')
        if not event_id or not dl_hash or not registration_ids:
            raise Forbidden(_("These parameters to access tickets are invalid."))

        event = request.env['event.event'].browse(event_id).exists()
        hash_truth = event._get_tickets_dl_access_hash(registration_ids)
        if not consteq(dl_hash, hash_truth):
            raise Forbidden(_("These parameters to access tickets are invalid."))

        event_registrations_sudo = self._fetch_registrations_for_event_tickets_dl(event_id, registration_ids)
        if not event_registrations_sudo:
            raise NotFound(_("Those registrations do not exist or are invalid."))

        report_name_prefix = "Ticket" if simplified else "Badges" if badge_mode else "Tickets"
        report_name = f"{report_name_prefix} - {event.name} ({event.date_begin_located})"
        if len(event_registrations_sudo) == 1:
            report_name += f" - {event_registrations_sudo[0].name}"

        # sudo is necessary for accesses in template.
        if simplified:
            html = request.env['ir.actions.report'].sudo()._render_qweb_html(
                'event.action_report_event_registration_simplified_ticket',
                event_registrations_sudo.ids
            )[0]
            return request.make_response(html)
        else:
            pdf = request.env['ir.actions.report'].sudo()._render_qweb_pdf(
                'event.action_report_event_registration_foldable_badge' if badge_mode else
                'event.action_report_event_registration_full_page_ticket',
                event_registrations_sudo.ids
            )[0]
            pdfhttpheaders = [
                ('Content-Type', 'application/pdf'),
                ('Content-Length', len(pdf)),
                ('Content-Disposition', content_disposition(f'{report_name}.pdf'))
            ]
            return request.make_response(pdf, headers=pdfhttpheaders)

    def _fetch_registrations_for_event_tickets_dl(self, event_id, registration_ids):
        """ Fetch attendees in registration_ids belonging to event_id. Meant to allow override in order
        to filter out registrations base on additional conditions. Helper method of /event/tickets_dl. """
        return request.env['event.registration'].sudo().search([
            ('id', 'in', registration_ids),
            ('event_id', '=', event_id)
        ])
>>>>>>> 18abc323ef6b ([IMP] {website_}event{_sale,_exhibitor}: ease ticket access)
