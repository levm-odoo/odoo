# Part of Odoo. See LICENSE file for full copyright and licensing details.

import logging
import re

from werkzeug.urls import url_join

from odoo import api, fields, models, _
from odoo.addons.website.tools import text_from_html
from odoo.http import request
from odoo.osv import expression
from odoo.exceptions import AccessError, UserError
from odoo.tools import escape_psql
from odoo.tools.json import scriptsafe as json_safe

logger = logging.getLogger(__name__)


class WebsiteSeoMetadata(models.AbstractModel):
    _name = 'website.seo.metadata'

    _description = 'SEO metadata'

    is_seo_optimized = fields.Boolean("SEO optimized", compute='_compute_is_seo_optimized')
    website_meta_title = fields.Char("Website meta title", translate=True, prefetch="website_meta")
    website_meta_description = fields.Text("Website meta description", translate=True, prefetch="website_meta")
    website_meta_keywords = fields.Char("Website meta keywords", translate=True, prefetch="website_meta")
    website_meta_og_img = fields.Char("Website opengraph image")
    seo_name = fields.Char("Seo name", translate=True, prefetch=True)

    def _compute_is_seo_optimized(self):
        for record in self:
            record.is_seo_optimized = record.website_meta_title and record.website_meta_description and record.website_meta_keywords

    def _default_website_meta(self):
        """ This method will return default meta information. It return the dict
            contains meta property as a key and meta content as a value.
            e.g. 'og:type': 'website'.

            Override this method in case you want to change default value
            from any model. e.g. change value of og:image to product specific
            images instead of default images
        """
        self.ensure_one()
        company = request.website.company_id.sudo()
        title = request.website.name
        if 'name' in self:
            title = '%s | %s' % (self.name, title)

        img_field = 'social_default_image' if request.website.has_social_default_image else 'logo'

        # Default meta for OpenGraph
        default_opengraph = {
            'og:type': 'website',
            'og:title': title,
            'og:site_name': request.website.name,
            'og:url': url_join(request.website.domain or request.httprequest.url_root, self.env['ir.http']._url_for(request.httprequest.path)),
            'og:image': request.website.image_url(request.website, img_field),
        }
        # Default meta for Twitter
        default_twitter = {
            'twitter:card': 'summary_large_image',
            'twitter:title': title,
            'twitter:image': request.website.image_url(request.website, img_field, size='300x300'),
        }
        if company.social_twitter:
            default_twitter['twitter:site'] = "@%s" % company.social_twitter.split('/')[-1]

        return {
            'default_opengraph': default_opengraph,
            'default_twitter': default_twitter
        }

    def get_website_meta(self):
        """ This method will return final meta information. It will replace
            default values with user's custom value (if user modified it from
            the seo popup of frontend)

            This method is not meant for overridden. To customize meta values
            override `_default_website_meta` method instead of this method. This
            method only replaces user custom values in defaults.
        """
        root_url = request.website.domain or request.httprequest.url_root.strip('/')
        default_meta = self._default_website_meta()
        opengraph_meta, twitter_meta = default_meta['default_opengraph'], default_meta['default_twitter']
        if self.website_meta_title:
            opengraph_meta['og:title'] = self.website_meta_title
            twitter_meta['twitter:title'] = self.website_meta_title
        if self.website_meta_description:
            opengraph_meta['og:description'] = self.website_meta_description
            twitter_meta['twitter:description'] = self.website_meta_description
        opengraph_meta['og:image'] = url_join(root_url, self.env['ir.http']._url_for(self.website_meta_og_img or opengraph_meta['og:image']))
        twitter_meta['twitter:image'] = url_join(root_url, self.env['ir.http']._url_for(self.website_meta_og_img or twitter_meta['twitter:image']))
        return {
            'opengraph_meta': opengraph_meta,
            'twitter_meta': twitter_meta,
            'meta_description': default_meta.get('default_meta_description')
        }


class WebsiteCover_PropertiesMixin(models.AbstractModel):
    _name = 'website.cover_properties.mixin'

    _description = 'Cover Properties Website Mixin'

    cover_properties = fields.Text('Cover Properties', default=lambda s: json_safe.dumps(s._default_cover_properties()))

    def _default_cover_properties(self):
        return {
            "background_color_class": "o_cc3",
            "background-image": "none",
            "opacity": "0.2",
            "resize_class": "o_half_screen_height",
        }

    def _get_background(self, height=None, width=None):
        self.ensure_one()
        properties = json_safe.loads(self.cover_properties)
        img = properties.get('background-image', "none")

        if img.startswith('url(/web/image/'):
            suffix = ""
            if height is not None:
                suffix += "&height=%s" % height
            if width is not None:
                suffix += "&width=%s" % width
            if suffix:
                suffix = '?' not in img and "?%s" % suffix or suffix
                img = img[:-1] + suffix + ')'
        return img

    def write(self, vals):
        if 'cover_properties' not in vals:
            return super().write(vals)

        cover_properties = json_safe.loads(vals['cover_properties'])
        resize_classes = cover_properties.get('resize_class', '').split()
        classes = ['o_half_screen_height', 'o_full_screen_height', 'cover_auto']
        if not set(resize_classes).isdisjoint(classes):
            # Updating cover properties and the given 'resize_class' set is
            # valid, normal write.
            return super().write(vals)

        # If we do not receive a valid resize_class via the cover_properties, we
        # keep the original one (prevents updates on list displays from
        # destroying resize_class).
        copy_vals = dict(vals)
        for item in self:
            old_cover_properties = json_safe.loads(item.cover_properties)
            cover_properties['resize_class'] = old_cover_properties.get('resize_class', classes[0])
            copy_vals['cover_properties'] = json_safe.dumps(cover_properties)
            super(WebsiteCover_PropertiesMixin, item).write(copy_vals)
        return True


class WebsiteMultiMixin(models.AbstractModel):
    _name = 'website.multi.mixin'

    _description = 'Multi Website Mixin'

    website_id = fields.Many2one(
        "website",
        string="Website",
        ondelete="restrict",
        help="Restrict to a specific website.",
        index=True,
    )

    def can_access_from_current_website(self, website_id=False):
        can_access = True
        for record in self:
            if (website_id or record.website_id.id) not in (False, request.env['website'].get_current_website().id):
                can_access = False
                continue
        return can_access


class WebsitePublishedMixin(models.AbstractModel):
    _name = 'website.published.mixin'

    _description = 'Website Published Mixin'

    website_published = fields.Boolean('Visible on current website', related='is_published', readonly=False)
    is_published = fields.Boolean('Is Published', copy=False, default=lambda self: self._default_is_published(), index=True)
    publish_on = fields.Datetime(
        "Auto publish on",
        copy=False,
        help="This page will automatically go live on the specified date.",
    )
    published_date = fields.Datetime("Published date", copy=False)
    can_publish = fields.Boolean('Can Publish', compute='_compute_can_publish')
    website_url = fields.Char('Website URL', compute='_compute_website_url', help='The full URL to access the document through the website.')

    @api.depends_context('lang')
    def _compute_website_url(self):
        for record in self:
            record.website_url = '#'

    @api.constrains("is_published")
    def _check_is_published(self):
        for record in self:
            if record.is_published and not record.published_date:
                # Check if something must be done just after publishing.
                self._check_for_action_post_publish()
                # If the record is being published and does not have a
                # published_date set, set the published_date to the current date
                # and time.
                record.published_date = fields.Datetime.now()
                # Additionally, set the publish_on field to False
                # This likely means that the record should be published
                # immediately.
                record.publish_on = False

    def _default_is_published(self):
        return False

    def action_unschedule(self):
        for page in self:
            page.publish_on = False

    def _models_generator(self):
        """
        This method generates a sequence of models that contain the field
        'publish_on'. Thus all the models that inherit WebsitePublishedMixin.

        :return: A generator yielding models containing the 'publish_on' field.
        :rtype: generator of odoo.models.Model
        """
        # Retrieve the models containing the field 'publish_on' and filter
        # transient models and related fields.
        models = [
            self.env[m]
            for m in self.env["ir.model.fields"]
            .sudo()
            .search(
                [
                    ("name", "=", "publish_on"),
                    ("model_id.abstract", "=", False),
                    ("store", "=", True),
                    ("related", "=", False),
                ]
            )
            .mapped("model")
            if (
                m in self.env
                and {"id", "is_published"} <= set(self.env[m]._fields)
            )
        ]
        yield from models

    def _cron_publish_scheduled_pages(self):
        """
        Method triggered by a cron job to publish records at a scheduled time.

        This method iterates through each model containing the 'publish_on'
        field. It searches for records scheduled to be published before the
        current datetime. If such records are found, it updates their
        'is_published' field to True and clears the 'publish_on' field.

        :return: None
        :rtype: None
        """
        # Iterate through each model containing the 'publish_on' field.
        for model in self._models_generator():
            pages = model.search(
                [
                    ("publish_on", "!=", False),
                    ("publish_on", "<", fields.Datetime.now()),
                ]
            )
            # Update 'is_published' field to True for retrieved records.
            if pages:
                pages.write({"is_published": True, "publish_on": False})

    def _manage_next_scheduled_action(self):
        """
        Manages the next scheduled action for publishing records with a
        'publish_on' field.

        This method retrieves the scheduled action for publishing scheduled
        pages. It checks if the scheduled action exists and raises a UserError
        if it is not found. It then finds the next scheduled trigger datetime
        and the earliest scheduled page to trigger. If no scheduled page is
        found, it returns False. If a scheduled page is found and it is either
        the first one or its publish_on time is earlier than the next scheduled
        trigger datetime, it creates a new trigger for the earliest scheduled
        page.

        :return: True if the next scheduled action is managed successfully,
                 False if there is no more scheduled action to manage.
        :rtype: bool
        """
        # Retrieve the scheduled action for publishing scheduled pages.
        scheduled_action_cron = self.env.ref(
            "website.ir_cron_publish_scheduled_pages", raise_if_not_found=False
        )

        # Check if the scheduled action exists
        if not scheduled_action_cron:
            # Raise a user error if the scheduled action is not found.
            raise UserError(
                _(
                    'The scheduled action "Website Publish Mixin: Publish scheduled website page" '
                    "has been deleted. Please contact your administrator to have the action restored "
                    'or to reinstall the website module.'
                )
            )

        next_trigger = self.env["ir.cron.trigger"].sudo().search(
            [("cron_id", "=", scheduled_action_cron.id),
             ("call_at", ">=", fields.Datetime.now())],
            order="call_at asc",
            limit=1
        )
        next_trigger_datetime = False
        if len(next_trigger):
            next_trigger_datetime = next_trigger.call_at

        # Find the earliest scheduled page to trigger.
        earliest_scheduled_pages = []
        for model in self._models_generator():
            # Retrieve records where 'publish_on' is in the past and 'scheduled'
            # is True.
            if model._name == 'website.published.mixin':
                continue
            scheduled_records = model.sudo().search(
                [("publish_on", "!=", False)], order="publish_on asc", limit=1
            )
            if scheduled_records:
                earliest_scheduled_pages.append(scheduled_records.publish_on)

        # Return False if no scheduled page is found.
        if not earliest_scheduled_pages:
            return False

        # Arrange the retrieved dates in ascending order.
        earliest_scheduled_pages.sort()

        # We create the trigger if it doesn't exist or if the date is before the
        # new scheduled page
        if (not next_trigger_datetime
            or (earliest_scheduled_pages[0] < next_trigger_datetime)):
            # Delete any existing triggers associated with the scheduled action.
            # To prevent concurrent queries on the database, we only unlink
            # the cron triggers where call_at is in the future. Other triggers
            # are managed automatically by the ir.cron model.
            self.env["ir.cron.trigger"].sudo().search(
                [
                    ("cron_id", "=", scheduled_action_cron.id),
                    ("call_at", ">=", fields.Datetime.now()),
                ]
            ).unlink()

            # Trigger the scheduled action with the publish time of the earliest
            # scheduled page.
            scheduled_action_cron._trigger(earliest_scheduled_pages[0])

        return True

    def website_publish_button(self):
        self.ensure_one()
        value = not self.website_published
        self.write({'website_published': value, 'publish_on': False})
        return value

    def open_website_url(self):
        return self.env['website'].get_client_action(self.website_url)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)

        for record in records:
            # Check if any record is attempting to be published without permission
            if record.is_published and not record.can_publish:
                raise AccessError(self._get_can_publish_error_message())
            # Unpublish record if it's not active
            if "active" in record._fields and not record.active and record.is_published:
                record.is_published = False

        return records

    def write(self, values):
        # Check if any record is attempting to be published without permission
        if "is_published" in values and any(not record.can_publish for record in self):
            raise AccessError(self._get_can_publish_error_message())

        # Unpublish and unschedule record if it's not active
        if "active" in values and not values["active"]:
            values["is_published"] = False
            values["publish_on"] = False

        if values.get("is_published") and values.get("publish_on"):
            values["publish_on"] = False

        if "publish_on" in values:
            res = super().write(values)
            self._manage_next_scheduled_action()
            return res

        return super().write(values)

    def create_and_get_website_url(self, **kwargs):
        return self.create(kwargs).website_url

    def _check_for_action_post_publish(self):
        """
        Placeholder method to be overridden to perform additional checks or
        actions after a record is published.

        :return: None
        :rtype: None
        """
        pass

    def _compute_can_publish(self):
        """ This method can be overridden if you need more complex rights management than just 'website_restricted_editor'
        The publish widget will be hidden and the user won't be able to change the 'website_published' value
        if this method sets can_publish False """
        for record in self:
            record.can_publish = True

    @api.model
    def _get_can_publish_error_message(self):
        """ Override this method to customize the error message shown when the user doesn't
        have the rights to publish/unpublish. """
        return _("You do not have the rights to publish/unpublish")


class WebsitePublishedMultiMixin(WebsitePublishedMixin):
    _inherit = ['website.published.mixin', 'website.multi.mixin']
    _description = 'Multi Website Published Mixin'

    website_published = fields.Boolean(compute='_compute_website_published',
                                       inverse='_inverse_website_published',
                                       search='_search_website_published',
                                       related=False, readonly=False)

    @api.depends('is_published', 'website_id')
    @api.depends_context('website_id')
    def _compute_website_published(self):
        current_website_id = self._context.get('website_id')
        for record in self:
            if current_website_id:
                record.website_published = record.is_published and (not record.website_id or record.website_id.id == current_website_id)
            else:
                record.website_published = record.is_published

    def _inverse_website_published(self):
        for record in self:
            record.is_published = record.website_published

    def _search_website_published(self, operator, value):
        if not isinstance(value, bool) or operator not in ('=', '!='):
            logger.warning('unsupported search on website_published: %s, %s', operator, value)
            return [()]

        if operator in expression.NEGATIVE_TERM_OPERATORS:
            value = not value

        current_website_id = self._context.get('website_id')
        is_published = [('is_published', '=', value)]
        if current_website_id:
            on_current_website = self.env['website'].website_domain(current_website_id)
            return expression.AND([is_published, on_current_website])
        else:  # should be in the backend, return things that are published anywhere
            return is_published

    def open_website_url(self):
        website_id = False
        if self.website_id:
            website_id = self.website_id.id
            if self.website_id.domain:
                client_action_url = self.env['website'].get_client_action_url(self.website_url)
                client_action_url = f'{client_action_url}&website_id={website_id}'
                return {
                    'type': 'ir.actions.act_url',
                    'url': url_join(self.website_id.domain, client_action_url),
                    'target': 'self',
                }
        return self.env['website'].get_client_action(self.website_url, False, website_id)


class WebsiteSearchableMixin(models.AbstractModel):
    """Mixin to be inherited by all models that need to searchable through website"""
    _description = 'Website Searchable Mixin'

    @api.model
    def _search_build_domain(self, domain_list, search, fields, extra=None):
        """
        Builds a search domain AND-combining a base domain with partial matches of each term in
        the search expression in any of the fields.

        :param domain_list: base domain list combined in the search expression
        :param search: search expression string
        :param fields: list of field names to match the terms of the search expression with
        :param extra: function that returns an additional subdomain for a search term

        :return: domain limited to the matches of the search expression
        """
        domains = domain_list.copy()
        if search:
            for search_term in search.split(' '):
                subdomains = [[(field, 'ilike', escape_psql(search_term))] for field in fields]
                if extra:
                    subdomains.append(extra(self.env, search_term))
                domains.append(expression.OR(subdomains))
        return expression.AND(domains)

    @api.model
    def _search_get_detail(self, website, order, options):
        """
        Returns indications on how to perform the searches

        :param website: website within which the search is done
        :param order: order in which the results are to be returned
        :param options: search options

        :return: search detail as expected in elements of the result of website._search_get_details()
            These elements contain the following fields:
            - model: name of the searched model
            - base_domain: list of domains within which to perform the search
            - search_fields: fields within which the search term must be found
            - fetch_fields: fields from which data must be fetched
            - mapping: mapping from the results towards the structure used in rendering templates.
                The mapping is a dict that associates the rendering name of each field
                to a dict containing the 'name' of the field in the results list and the 'type'
                that must be used for rendering the value
            - icon: name of the icon to use if there is no image

        This method must be implemented by all models that inherit this mixin.
        """
        raise NotImplementedError()

    @api.model
    def _search_fetch(self, search_detail, search, limit, order):
        fields = search_detail['search_fields']
        base_domain = search_detail['base_domain']
        domain = self._search_build_domain(base_domain, search, fields, search_detail.get('search_extra'))
        model = self.sudo() if search_detail.get('requires_sudo') else self
        results = model.search(
            domain,
            limit=limit,
            order=search_detail.get('order', order)
        )
        count = model.search_count(domain)
        return results, count

    def _search_render_results(self, fetch_fields, mapping, icon, limit):
        results_data = self.read(fetch_fields)[:limit]
        for result in results_data:
            result['_fa'] = icon
            result['_mapping'] = mapping
        html_fields = [config['name'] for config in mapping.values() if config.get('html')]
        if html_fields:
            for data in results_data:
                for html_field in html_fields:
                    if data[html_field]:
                        if html_field == 'arch':
                            # Undo second escape of text nodes from wywsiwyg.js _getEscapedElement.
                            data[html_field] = re.sub(r'&amp;(?=\w+;)', '&', data[html_field])
                        text = text_from_html(data[html_field], True)
                        data[html_field] = text
        return results_data
