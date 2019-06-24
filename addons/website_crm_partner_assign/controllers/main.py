# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import datetime
import werkzeug

from collections import OrderedDict
from werkzeug.exceptions import NotFound

from odoo import fields
from odoo import http
from odoo.exceptions import AccessError, MissingError
from odoo.http import request
from odoo.osv.expression import OR
from odoo.addons.http_routing.models.ir_http import slug, unslug
from odoo.addons.website.models.ir_http import sitemap_qs2dom
from odoo.addons.portal.controllers.portal import CustomerPortal
from odoo.addons.website_partner.controllers.main import WebsitePartnerPage

from odoo.tools.translate import _


class WebsiteAccount(CustomerPortal):

    def get_domain_my_lead(self, user):
        return [
            ('partner_assigned_id', 'child_of', user.commercial_partner_id.id),
            ('type', '=', 'lead')
        ]

    def get_domain_my_opp(self, user):
        return [
            ('partner_assigned_id', 'child_of', user.commercial_partner_id.id),
            ('type', '=', 'opportunity')
        ]

    def _prepare_portal_layout_values(self):
        values = super(WebsiteAccount, self)._prepare_portal_layout_values()
        lead_count = request.env['crm.lead'].search_count(self.get_domain_my_lead(request.env.user))
        opp_count = request.env['crm.lead'].search_count(self.get_domain_my_opp(request.env.user))
        values.update({
            'lead_count': lead_count,
            'opp_count': opp_count,
        })
        return values

    def _lead_get_page_view_values(self, lead, access_token, **kwargs):
        values = {
            'page_name': 'lead',
            'lead': lead,
        }
        return self._get_page_view_values(lead, access_token, values, 'my_leads_history', False, **kwargs)

    def _opportunity_get_page_view_values(self, opportunity, access_token, **kwargs):
        values = {
            'page_name': 'opportunity',
            'opportunity': opportunity,
            'user_activity': opportunity.sudo().activity_ids.filtered(lambda activity: activity.user_id == request.env.user)[:1],
            'stages': request.env['crm.stage'].search([('is_won', '!=', True)], order='sequence desc, name desc, id desc'),
            'activity_types': request.env['mail.activity.type'].sudo().search([]),
            'states': request.env['res.country.state'].sudo().search([]),
            'countries': request.env['res.country'].sudo().search([]),
        }
        return self._get_page_view_values(opportunity, access_token, values, 'my_opportunities_history', False, **kwargs)

    @http.route(['/my/leads', '/my/leads/page/<int:page>'], type='http', auth="user", website=True)
    def portal_my_leads(self, page=1, date_begin=None, date_end=None, search=None, search_in='content', sortby=None, **kw):
        values = self._prepare_portal_layout_values()
        CrmLead = request.env['crm.lead']
        domain = self.get_domain_my_lead(request.env.user)

        searchbar_sortings = {
            'date': {'label': _('Newest'), 'order': 'create_date desc'},
            'name': {'label': _('Name'), 'order': 'name'},
            'contact_name': {'label': _('Contact Name'), 'order': 'contact_name'},
        }
        searchbar_inputs = {
            'content': {'input': 'content', 'label': _('Search <span class="nolabel"> (in Content)</span>')},
            'contact_name': {'input': 'contact', 'label': _('Search in Contact')},
            'message': {'input': 'message', 'label': _('Search in Message')},
            'all': {'input': 'all', 'label': _('Search in All')},
        }

        # default sort by value
        if not sortby:
            sortby = 'date'
        order = searchbar_sortings[sortby]['order']

        # archive groups - Default Group By 'create_date'
        archive_groups = self._get_archive_groups('crm.lead', domain)
        if date_begin and date_end:
            domain += [('create_date', '>', date_begin), ('create_date', '<=', date_end)]

        # search
        if search and search_in:
            search_domain = []
            if search_in in ('content', 'all'):
                search_domain = OR([search_domain, [('name', 'ilike', search)]])
            if search_in in ('contact', 'all'):
                search_domain = OR([search_domain, [('contact_name', 'ilike', search)]])
            if search_in in ('message', 'all'):
                search_domain = OR([search_domain, [('message_ids.body', 'ilike', search)]])
            domain += search_domain

        # pager
        lead_count = CrmLead.search_count(domain)
        pager = request.website.pager(
            url="/my/leads",
            url_args={'date_begin': date_begin, 'date_end': date_end, 'sortby': sortby},
            total=lead_count,
            page=page,
            step=self._items_per_page
        )
        # content according to pager and archive selected
        leads = CrmLead.search(domain, order=order, limit=self._items_per_page, offset=pager['offset'])
        request.session['my_leads_history'] = leads.ids[:100]

        values.update({
            'date': date_begin,
            'leads': leads,
            'page_name': 'lead',
            'archive_groups': archive_groups,
            'default_url': '/my/leads',
            'pager': pager,
            'searchbar_sortings': searchbar_sortings,
            'searchbar_inputs': searchbar_inputs,
            'search_in': search_in,
            'sortby': sortby,
        })
        return request.render("website_crm_partner_assign.portal_my_leads", values)

    @http.route(['/my/opportunities', '/my/opportunities/page/<int:page>'], type='http', auth="user", website=True)
    def portal_my_opportunities(self, page=1, date_begin=None, date_end=None, search=None, search_in='content', sortby=None, filterby=None, **kw):
        values = self._prepare_portal_layout_values()
        CrmLead = request.env['crm.lead']
        domain = self.get_domain_my_opp(request.env.user)

        today = fields.Date.today()
        this_week_end_date = fields.Date.to_string(fields.Date.from_string(today) + datetime.timedelta(days=7))

        searchbar_filters = {
            'all': {'label': _('Active'), 'domain': []},
            'today': {'label': _('Today Activities'), 'domain': [('activity_date_deadline', '=', today)]},
            'week': {'label': _('This Week Activities'),
                     'domain': [('activity_date_deadline', '>=', today), ('activity_date_deadline', '<=', this_week_end_date)]},
            'overdue': {'label': _('Overdue Activities'), 'domain': [('activity_date_deadline', '<', today)]},
            'won': {'label': _('Won'), 'domain': [('stage_id.is_won', '=', True)]},
            'lost': {'label': _('Lost'), 'domain': [('active', '=', False), ('probability', '=', 0)]},
        }
        searchbar_sortings = {
            'date': {'label': _('Newest'), 'order': 'create_date desc'},
            'name': {'label': _('Name'), 'order': 'name'},
            'contact_name': {'label': _('Contact Name'), 'order': 'contact_name'},
            'revenue': {'label': _('Expected Revenue'), 'order': 'planned_revenue desc'},
            'probability': {'label': _('Probability'), 'order': 'probability desc'},
            'stage': {'label': _('Stage'), 'order': 'stage_id'},
        }
        searchbar_inputs = {
            'content': {'input': 'content', 'label': _('Search <span class="nolabel"> (in Content)</span>')},
            'contact_name': {'input': 'contact', 'label': _('Search in Contact')},
            'message': {'input': 'message', 'label': _('Search in Message')},
            'all': {'input': 'all', 'label': _('Search in All')},
        }

        # default sort by value
        if not sortby:
            sortby = 'date'
        order = searchbar_sortings[sortby]['order']
        # default filter by value
        if not filterby:
            filterby = 'all'
        domain += searchbar_filters[filterby]['domain']
        if filterby == 'lost':
            CrmLead = CrmLead.with_context(active_test=False)

        # archive groups - Default Group By 'create_date'
        archive_groups = self._get_archive_groups('crm.lead', domain)
        if date_begin and date_end:
            domain += [('create_date', '>', date_begin), ('create_date', '<=', date_end)]

        # search
        if search and search_in:
            search_domain = []
            if search_in in ('content', 'all'):
                search_domain = OR([search_domain, [('name', 'ilike', search)]])
            if search_in in ('contact', 'all'):
                search_domain = OR([search_domain, [('contact_name', 'ilike', search)]])
            if search_in in ('message', 'all'):
                search_domain = OR([search_domain, [('message_ids.body', 'ilike', search)]])
            domain += search_domain

        # pager
        opp_count = CrmLead.search_count(domain)
        pager = request.website.pager(
            url="/my/opportunities",
            url_args={'date_begin': date_begin, 'date_end': date_end, 'sortby': sortby, 'filterby': filterby},
            total=opp_count,
            page=page,
            step=self._items_per_page
        )
        # content according to pager and archive selected
        opportunities = CrmLead.search(domain, order=order, limit=self._items_per_page, offset=pager['offset'])
        request.session['my_opportunities_history'] = opportunities.ids[:100]

        values.update({
            'date': date_begin,
            'opportunities': opportunities,
            'page_name': 'opportunity',
            'archive_groups': archive_groups,
            'default_url': '/my/opportunities',
            'pager': pager,
            'searchbar_sortings': searchbar_sortings,
            'searchbar_inputs': searchbar_inputs,
            'search_in': search_in,
            'sortby': sortby,
            'searchbar_filters': OrderedDict(sorted(searchbar_filters.items())),
            'filterby': filterby,
        })
        return request.render("website_crm_partner_assign.portal_my_opportunities", values)

    @http.route(['''/my/lead/<model('crm.lead', "[('type','=', 'lead')]"):lead>'''], type='http', auth="user", website=True)
    def portal_my_lead(self, lead, access_token=None, **kw):
        if lead.type != 'lead':
            raise NotFound()
        try:
            lead_sudo = self._document_check_access('crm.lead', lead.id, access_token)
        except (AccessError, MissingError):
            return request.redirect('/my')

        values = self._lead_get_page_view_values(lead_sudo, access_token, **kw)
        return request.render("website_crm_partner_assign.portal_my_lead", values)

    @http.route(['''/my/opportunity/<model('crm.lead', "[('type','=', 'opportunity')]"):opp>'''], type='http', auth="user", website=True)
    def portal_my_opportunity(self, opp, access_token=None, **kw):
        if opp.type != 'opportunity':
            raise NotFound()

        try:
            opportunity_sudo = self._document_check_access('crm.lead', opp.id, access_token)
        except (AccessError, MissingError):
            return request.redirect('/my')

        values = self._opportunity_get_page_view_values(opportunity_sudo, access_token, **kw)
        return request.render("website_crm_partner_assign.portal_my_opportunity", values)


class WebsiteCrmPartnerAssign(WebsitePartnerPage):
    _references_per_page = 40

    def sitemap_partners(env, rule, qs):
        if not qs or qs.lower() in '/partners':
            yield {'loc': '/partners'}

        Grade = env['res.partner.grade']
        dom = [('website_published', '=', True)]
        dom += sitemap_qs2dom(qs=qs, route='/partners/grade/', field=Grade._rec_name)
        for grade in env['res.partner.grade'].search(dom):
            loc = '/partners/grade/%s' % slug(grade)
            if not qs or qs.lower() in loc:
                yield {'loc': loc}

        partners_dom = [('is_company', '=', True), ('grade_id', '!=', False), ('website_published', '=', True),
                        ('grade_id.website_published', '=', True), ('country_id', '!=', False)]
        dom += sitemap_qs2dom(qs=qs, route='/partners/country/')
        countries = env['res.partner'].sudo().read_group(partners_dom, fields=['id', 'country_id'], groupby='country_id')
        for country in countries:
            loc = '/partners/country/%s' % slug(country['country_id'])
            if not qs or qs.lower() in loc:
                yield {'loc': loc}

    @http.route([
        '/partners',
        '/partners/page/<int:page>',

        '/partners/grade/<model("res.partner.grade"):grade>',
        '/partners/grade/<model("res.partner.grade"):grade>/page/<int:page>',

        '/partners/country/<model("res.country"):country>',
        '/partners/country/<model("res.country"):country>/page/<int:page>',

        '/partners/grade/<model("res.partner.grade"):grade>/country/<model("res.country"):country>',
        '/partners/grade/<model("res.partner.grade"):grade>/country/<model("res.country"):country>/page/<int:page>',
    ], type='http', auth="public", website=True, sitemap=sitemap_partners)
    def partners(self, country=None, grade=None, page=0, **post):
        country_all = post.pop('country_all', False)
        partner_obj = request.env['res.partner']
        country_obj = request.env['res.country']
        search = post.get('search', '')

        base_partner_domain = [('is_company', '=', True), ('grade_id', '!=', False), ('website_published', '=', True)]
        if not request.env['res.users'].has_group('website.group_website_publisher'):
            base_partner_domain += [('grade_id.website_published', '=', True)]
        if search:
            base_partner_domain += ['|', ('name', 'ilike', search), ('website_description', 'ilike', search)]

        # group by grade
        grade_domain = list(base_partner_domain)
        if not country and not country_all:
            country_code = request.session['geoip'].get('country_code')
            if country_code:
                country = country_obj.search([('code', '=', country_code)], limit=1)
        if country:
            grade_domain += [('country_id', '=', country.id)]
        grades = partner_obj.sudo().read_group(
            grade_domain, ["id", "grade_id"],
            groupby="grade_id")
        grades_partners = partner_obj.sudo().search_count(grade_domain)
        # flag active grade
        for grade_dict in grades:
            grade_dict['active'] = grade and grade_dict['grade_id'][0] == grade.id
        grades.insert(0, {
            'grade_id_count': grades_partners,
            'grade_id': (0, _("All Categories")),
            'active': bool(grade is None),
        })

        # group by country
        country_domain = list(base_partner_domain)
        if grade:
            country_domain += [('grade_id', '=', grade.id)]
        countries = partner_obj.sudo().read_group(
            country_domain, ["id", "country_id"],
            groupby="country_id", orderby="country_id")
        countries_partners = partner_obj.sudo().search_count(country_domain)
        # flag active country
        for country_dict in countries:
            country_dict['active'] = country and country_dict['country_id'] and country_dict['country_id'][0] == country.id
        countries.insert(0, {
            'country_id_count': countries_partners,
            'country_id': (0, _("All Countries")),
            'active': bool(country is None),
        })

        # current search
        if grade:
            base_partner_domain += [('grade_id', '=', grade.id)]
        if country:
            base_partner_domain += [('country_id', '=', country.id)]

        # format pager
        if grade and not country:
            url = '/partners/grade/' + slug(grade)
        elif country and not grade:
            url = '/partners/country/' + slug(country)
        elif country and grade:
            url = '/partners/grade/' + slug(grade) + '/country/' + slug(country)
        else:
            url = '/partners'
        url_args = {}
        if search:
            url_args['search'] = search
        if country_all:
            url_args['country_all'] = True

        partner_count = partner_obj.sudo().search_count(base_partner_domain)
        pager = request.website.pager(
            url=url, total=partner_count, page=page, step=self._references_per_page, scope=7,
            url_args=url_args)

        # search partners matching current search parameters
        partner_ids = partner_obj.sudo().search(
            base_partner_domain, order="grade_sequence DESC, implemented_count DESC, display_name ASC, id ASC",
            offset=pager['offset'], limit=self._references_per_page)
        partners = partner_ids.sudo()

        google_map_partner_ids = ','.join(str(p.id) for p in partners)
        google_maps_api_key = request.website.google_maps_api_key

        values = {
            'countries': countries,
            'current_country': country,
            'grades': grades,
            'current_grade': grade,
            'partners': partners,
            'google_map_partner_ids': google_map_partner_ids,
            'pager': pager,
            'searches': post,
            'search_path': "%s" % werkzeug.url_encode(post),
            'google_maps_api_key': google_maps_api_key,
        }
        return request.render("website_crm_partner_assign.index", values, status=partners and 200 or 404)


    # Do not use semantic controller due to sudo()
    @http.route(['/partners/<partner_id>'], type='http', auth="public", website=True)
    def partners_detail(self, partner_id, **post):
        _, partner_id = unslug(partner_id)
        current_grade, current_country = None, None
        grade_id = post.get('grade_id')
        country_id = post.get('country_id')
        if grade_id:
            current_grade = request.env['res.partner.grade'].browse(int(grade_id)).exists()
        if country_id:
            current_country = request.env['res.country'].browse(int(country_id)).exists()
        if partner_id:
            partner = request.env['res.partner'].sudo().browse(partner_id)
            is_website_publisher = request.env['res.users'].has_group('website.group_website_publisher')
            if partner.exists() and (partner.website_published or is_website_publisher):
                values = {
                    'main_object': partner,
                    'partner': partner,
                    'current_grade': current_grade,
                    'current_country': current_country
                }
                return request.render("website_crm_partner_assign.partner", values)
        return self.partners(**post)
