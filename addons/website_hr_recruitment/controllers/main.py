# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import warnings
from datetime import datetime, timedelta
from werkzeug.urls import url_encode

from odoo import http, _
from odoo.addons.http_routing.models.ir_http import slug
from odoo.osv.expression import AND
from odoo.http import request
from odoo.tools import email_normalize
from odoo.tools.misc import groupby


class WebsiteHrRecruitment(http.Controller):
    _jobs_per_page = 12

    def sitemap_jobs(env, rule, qs):
        if not qs or qs.lower() in '/jobs':
            yield {'loc': '/jobs'}

    @http.route([
        '/jobs',
        '/jobs/page/<int:page>',
    ], type='http', auth="public", website=True, sitemap=sitemap_jobs)
    def jobs(self, country_id=None, department_id=None, office_id=None, contract_type_id=None,
             is_remote=False, is_other_department=False, is_untyped=None, page=1, search=None, **kwargs):
        env = request.env(context=dict(request.env.context, show_address=True, no_tag_br=True))

        Country = env['res.country']
        Jobs = env['hr.job']
        Department = env['hr.department']

        country = Country.browse(int(country_id)) if country_id else None
        department = Department.browse(int(department_id)) if department_id else None
        office_id = int(office_id) if office_id else None
        contract_type_id = int(contract_type_id) if contract_type_id else None

        # Default search by user country
        if not (country or department or office_id or contract_type_id or kwargs.get('all_countries')):
            if request.geoip.country_code:
                countries_ = Country.search([('code', '=', request.geoip.country_code)])
                country = countries_[0] if countries_ else None
                if country:
                    country_count = Jobs.search_count(AND([
                        request.website.website_domain(),
                        [('address_id.country_id', '=', country.id)]
                    ]))
                    if not country_count:
                        country = False

        options = {
            'displayDescription': True,
            'allowFuzzy': not request.params.get('noFuzzy'),
            'country_id': country.id if country else None,
            'department_id': department.id if department else None,
            'office_id': office_id,
            'contract_type_id': contract_type_id,
            'is_remote': is_remote,
            'is_other_department': is_other_department,
            'is_untyped': is_untyped,
        }
        total, details, fuzzy_search_term = request.website._search_with_fuzzy("jobs", search,
            limit=1000, order="is_published desc, sequence, no_of_recruitment desc", options=options)
        # Browse jobs as superuser, because address is restricted
        jobs = details[0].get('results', Jobs).sudo()

        def sort(records_list, field_name):
            """ Sort records in the given collection according to the given
            field name, alphabetically. None values instead of records are
            placed at the end.

            :param list records_list: collection of records or None values
            :param str field_name: field on which to sort
            :return: sorted list
            """
            return sorted(
                records_list,
                key=lambda item: (item is None, item and item[field_name] or ''),
            )

        # Countries
        if country or is_remote:
            cross_country_options = options.copy()
            cross_country_options.update({
                'allowFuzzy': False,
                'country_id': None,
                'is_remote': False,
            })
            cross_country_total, cross_country_details, _ = request.website._search_with_fuzzy("jobs",
                fuzzy_search_term or search, limit=1000, order="is_published desc, sequence, no_of_recruitment desc",
                options=cross_country_options)
            # Browse jobs as superuser, because address is restricted
            cross_country_jobs = cross_country_details[0].get('results', Jobs).sudo()
        else:
            cross_country_total = total
            cross_country_jobs = jobs
        country_offices = set(j.address_id or None for j in cross_country_jobs)
        countries = sort(set(o and o.country_id or None for o in country_offices), 'name')
        count_per_country = {'all': cross_country_total}
        for c, jobs_list in groupby(cross_country_jobs, lambda job: job.address_id.country_id):
            count_per_country[c] = len(jobs_list)
        count_remote = len(cross_country_jobs.filtered(lambda job: not job.address_id))
        if count_remote:
            count_per_country[None] = count_remote

        # Departments
        if department or is_other_department:
            cross_department_options = options.copy()
            cross_department_options.update({
                'allowFuzzy': False,
                'department_id': None,
                'is_other_department': False,
            })
            cross_department_total, cross_department_details, _ = request.website._search_with_fuzzy("jobs",
                fuzzy_search_term or search, limit=1000, order="is_published desc, sequence, no_of_recruitment desc",
                options=cross_department_options)
            cross_department_jobs = cross_department_details[0].get('results', Jobs)
        else:
            cross_department_total = total
            cross_department_jobs = jobs
        departments = sort(set(j.department_id or None for j in cross_department_jobs), 'name')
        count_per_department = {'all': cross_department_total}
        for d, jobs_list in groupby(cross_department_jobs, lambda job: job.department_id):
            count_per_department[d] = len(jobs_list)
        count_other_department = len(cross_department_jobs.filtered(lambda job: not job.department_id))
        if count_other_department:
            count_per_department[None] = count_other_department

        # Offices
        if office_id or is_remote:
            cross_office_options = options.copy()
            cross_office_options.update({
                'allowFuzzy': False,
                'office_id': None,
                'is_remote': False,
            })
            cross_office_total, cross_office_details, _ = request.website._search_with_fuzzy("jobs",
                fuzzy_search_term or search, limit=1000, order="is_published desc, sequence, no_of_recruitment desc",
                options=cross_office_options)
            # Browse jobs as superuser, because address is restricted
            cross_office_jobs = cross_office_details[0].get('results', Jobs).sudo()
        else:
            cross_office_total = total
            cross_office_jobs = jobs
        offices = sort(set(j.address_id or None for j in cross_office_jobs), 'city')
        count_per_office = {'all': cross_office_total}
        for o, jobs_list in groupby(cross_office_jobs, lambda job: job.address_id):
            count_per_office[o] = len(jobs_list)
        count_remote = len(cross_office_jobs.filtered(lambda job: not job.address_id))
        if count_remote:
            count_per_office[None] = count_remote

        # Employment types
        if contract_type_id or is_untyped:
            cross_type_options = options.copy()
            cross_type_options.update({
                'allowFuzzy': False,
                'contract_type_id': None,
                'is_untyped': False,
            })
            cross_type_total, cross_type_details, _ = request.website._search_with_fuzzy("jobs",
                fuzzy_search_term or search, limit=1000, order="is_published desc, sequence, no_of_recruitment desc",
                options=cross_type_options)
            cross_type_jobs = cross_type_details[0].get('results', Jobs)
        else:
            cross_type_total = total
            cross_type_jobs = jobs
        employment_types = sort(set(j.contract_type_id for j in jobs if j.contract_type_id), 'name')
        count_per_employment_type = {'all': cross_type_total}
        for t, jobs_list in groupby(cross_type_jobs, lambda job: job.contract_type_id):
            count_per_employment_type[t] = len(jobs_list)
        count_untyped = len(cross_type_jobs.filtered(lambda job: not job.contract_type_id))
        if count_untyped:
            count_per_employment_type[None] = count_untyped

        pager = request.website.pager(
            url=request.httprequest.path.partition('/page/')[0],
            url_args=request.httprequest.args,
            total=total,
            page=page,
            step=self._jobs_per_page,
        )
        offset = pager['offset']
        jobs = jobs[offset:offset + self._jobs_per_page]

        office = env['res.partner'].browse(int(office_id)) if office_id else None
        contract_type = env['hr.contract.type'].browse(int(contract_type_id)) if contract_type_id else None

        # Render page
        return request.render("website_hr_recruitment.index", {
            'jobs': jobs,
            'countries': countries,
            'departments': departments,
            'offices': offices,
            'employment_types': employment_types,
            'country_id': country,
            'department_id': department,
            'office_id': office,
            'contract_type_id': contract_type,
            'is_remote': is_remote,
            'is_other_department': is_other_department,
            'is_untyped': is_untyped,
            'pager': pager,
            'search': fuzzy_search_term or search,
            'search_count': total,
            'original_search': fuzzy_search_term and search,
            'count_per_country': count_per_country,
            'count_per_department': count_per_department,
            'count_per_office': count_per_office,
            'count_per_employment_type': count_per_employment_type,
        })

    @http.route('/jobs/add', type='json', auth="user", website=True)
    def jobs_add(self, **kwargs):
        # avoid branding of website_description by setting rendering_bundle in context
        job = request.env['hr.job'].with_context(rendering_bundle=True).create({
            'name': _('Job Title'),
        })
        return f"/jobs/{slug(job)}"

    @http.route('''/jobs/detail/<model("hr.job"):job>''', type='http', auth="public", website=True, sitemap=True)
    def jobs_detail(self, job, **kwargs):
        redirect_url = f"/jobs/{slug(job)}"
        return request.redirect(redirect_url, code=301)

    @http.route('''/jobs/<model("hr.job"):job>''', type='http', auth="public", website=True, sitemap=True)
    def job(self, job, **kwargs):
        return request.render("website_hr_recruitment.detail", {
            'job': job,
            'main_object': job,
        })

    @http.route('''/jobs/apply/<model("hr.job"):job>''', type='http', auth="public", website=True, sitemap=True)
    def jobs_apply(self, job, **kwargs):
        error = {}
        default = {}
        if 'website_hr_recruitment_error' in request.session:
            error = request.session.pop('website_hr_recruitment_error')
            default = request.session.pop('website_hr_recruitment_default')
        return request.render("website_hr_recruitment.apply", {
            'job': job,
            'error': error,
            'default': default,
        })

    # Compatibility routes

    @http.route([
        '/jobs/country/<model("res.country"):country>',
        '/jobs/department/<model("hr.department"):department>',
        '/jobs/country/<model("res.country"):country>/department/<model("hr.department"):department>',
        '/jobs/office/<int:office_id>',
        '/jobs/country/<model("res.country"):country>/office/<int:office_id>',
        '/jobs/department/<model("hr.department"):department>/office/<int:office_id>',
        '/jobs/country/<model("res.country"):country>/department/<model("hr.department"):department>/office/<int:office_id>',
        '/jobs/employment_type/<int:contract_type_id>',
        '/jobs/country/<model("res.country"):country>/employment_type/<int:contract_type_id>',
        '/jobs/department/<model("hr.department"):department>/employment_type/<int:contract_type_id>',
        '/jobs/office/<int:office_id>/employment_type/<int:contract_type_id>',
        '/jobs/country/<model("res.country"):country>/department/<model("hr.department"):department>/employment_type/<int:contract_type_id>',
        '/jobs/country/<model("res.country"):country>/office/<int:office_id>/employment_type/<int:contract_type_id>',
        '/jobs/department/<model("hr.department"):department>/office/<int:office_id>/employment_type/<int:contract_type_id>',
        '/jobs/country/<model("res.country"):country>/department/<model("hr.department"):department>/office/<int:office_id>/employment_type/<int:contract_type_id>',
    ], type='http', auth="public", website=True, sitemap=False)
    def jobs_compatibility(self, country=None, department=None, office_id=None, contract_type_id=None, **kwargs):
        """
        Deprecated since Odoo 16.3: those routes are kept by compatibility.
        They should not be used in Odoo code anymore.
        """
        warnings.warn(
            "This route is deprecated since Odoo 16.3: the jobs list is now available at /jobs or /jobs/page/XXX",
            DeprecationWarning
        )
        url_params = {
            'country_id': country and country.id,
            'department_id': department and department.id,
            'office_id': office_id,
            'contract_type_id': contract_type_id,
            **kwargs,
        }
        return request.redirect(
            '/jobs?%s' % url_encode(url_params),
            code=301,
        )

    def _build_search_domain(self, field, value):
        if field == 'name':
            return [('partner_name', '=ilike', value)]
        if field == 'email':
            return [('email_normalized', '=', email_normalize(value))]
        if field == 'phone':
            return ['|', ('partner_phone', '=', value), ('partner_mobile', '=', value)]
        if field == 'linkedin':
            return [('linkedin_profile', '=ilike', value)]

    def _get_ongoing_application_response(self, ongoing_application, job_id, value):
        message = _("An application already exists for %s. Duplicates might be rejected.", value)
        if ongoing_application.user_id:
            message += " " + _("In case of issue, contact %s", ongoing_application.user_id.name)
            if ongoing_application.user_id.email:
                message += ", %s" % ongoing_application.user_id.email
            if ongoing_application.user_id.phone:
                message += ", %s" % ongoing_application.user_id.phone
        return {
            'applied_same_job': ongoing_application.job_id.id == int(job_id),
            'applied_other_job': True,
            'message': message
        }

    def _get_refused_application_response(self, job_id):
        message = _("You applied for this position less than 6 months ago, and have been rejected. Please don't reapply unless you have a good reason.")
        return {
            'applied_same_job': True,
            'applied_other_job': False,
            'message': message
        }

    @http.route('/website_hr_recruitment/check_recent_application', type='json', auth="public")
    def check_recent_application(self, field, value, job_id):
        Applicant = http.request.env['hr.applicant'].sudo()
        search_domain = self._build_search_domain(field, value)
        if not search_domain:
            return {
                'applied_same_job': False,
                'applied_other_job': False,
                'message': '',
            }

        applications = Applicant.search(search_domain + [
            '|',
                ('application_status', '=', 'ongoing'),
                '&',
                    ('application_status', '=', 'refused'),
                    ('active', '=', False),
        ], order='create_date desc')

        refused_applications = applications.filtered(
            lambda a: a.application_status == 'refused'
                      and not a.active
                      and a.job_id.id == int(job_id)
                      and a.create_date >= (datetime.now() - timedelta(days=180)))
        if refused_applications:
            return self._get_refused_application_response(job_id)

        ongoing_applications = applications.filtered(lambda a: a.application_status == 'ongoing')
        if ongoing_applications:
            return self._get_ongoing_application_response(ongoing_applications[0], job_id, value)

        return {
            'applied_same_job': False,
            'applied_other_job': False,
            'message': '',
        }
