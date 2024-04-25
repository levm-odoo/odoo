# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import base64
import json
import mimetypes

from urllib.parse import quote

from odoo import http, modules
from odoo.exceptions import AccessError
from odoo.http import request
from odoo.tools import ustr, file_open, file_path


class WebManifest(http.Controller):

    def _get_shortcuts(self):
        module_names = ['mail', 'crm', 'project', 'project_todo']
        try:
            module_ids = request.env['ir.module.module'].search([('state', '=', 'installed'), ('name', 'in', module_names)]) \
                                                        .sorted(key=lambda r: module_names.index(r["name"]))
        except AccessError:
            return []
        menu_roots = request.env['ir.ui.menu'].get_user_roots()
        datas = request.env['ir.model.data'].sudo().search([('model', '=', 'ir.ui.menu'),
                                                         ('res_id', 'in', menu_roots.ids),
                                                         ('module', 'in', module_names)])
        shortcuts = []
        for module in module_ids:
            data = datas.filtered(lambda res: res.module == module.name)
            if data:
                shortcuts.append({
                    'name': module.display_name,
                    'url': '/odoo?menu_id=%s' % data.mapped('res_id')[0],
                    'description': module.summary,
                    'icons': [{
                        'sizes': '100x100',
                        'src': module.icon,
                        'type': mimetypes.guess_type(module.icon)[0] or 'image/png'
                    }]
                })
        return shortcuts

    @http.route('/web/manifest.webmanifest', type='http', auth='public', methods=['GET'])
    def webmanifest(self):
        """ Returns a WebManifest describing the metadata associated with a web application.
        Using this metadata, user agents can provide developers with means to create user
        experiences that are more comparable to that of a native application.
        """
        web_app_name = request.env['ir.config_parameter'].sudo().get_param('web.web_app_name', 'Odoo')
        manifest = {
            'name': web_app_name,
            'scope': '/odoo',
            'start_url': '/odoo',
            'display': 'standalone',
            'background_color': '#714B67',
            'theme_color': '#714B67',
            'prefer_related_applications': False,
        }
        icon_sizes = ['192x192', '512x512']
        manifest['icons'] = [{
            'src': '/web/static/img/odoo-icon-%s.png' % size,
            'sizes': size,
            'type': 'image/png',
        } for size in icon_sizes]
        manifest['shortcuts'] = self._get_shortcuts()
        body = json.dumps(manifest, default=ustr)
        response = request.make_response(body, [
            ('Content-Type', 'application/manifest+json'),
        ])
        return response

    @http.route('/web/service-worker.js', type='http', auth='public', methods=['GET'])
    def service_worker(self):
        response = request.make_response(
            self._get_service_worker_content(),
            [
                ('Content-Type', 'text/javascript'),
                ('Service-Worker-Allowed', '/odoo'),
            ]
        )
        return response

    def _get_service_worker_content(self):
        """ Returns a ServiceWorker javascript file scoped for the backend (aka. '/web')
        """
        with file_open('web/static/src/service_worker.js') as f:
            body = f.read()
            return body

    def _icon_path(self):
        return 'web/static/img/odoo-icon-192x192.png'

    @http.route('/odoo/offline', type='http', auth='public', methods=['GET'])
    def offline(self):
        """ Returns the offline page delivered by the service worker """
        return request.render('web.webclient_offline', {
            'odoo_icon': base64.b64encode(file_open(self._icon_path(), 'rb').read())
        })

    @http.route('/scoped_app', type='http', auth='public', methods=['GET'])
    def scoped_app(self, app_id, path='/odoo', app_name=''):
        """ Returns the app shortcut page to install the app given in parameters """
        main_app_name = request.env['ir.config_parameter'].sudo().get_param('web.web_app_name', 'Odoo')
        scoped_app_values = {
            'app_id': app_id,
        }
        if app_id == "odoo":
            # main Odoo PWA
            scoped_app_values['app_name'] = main_app_name
            scoped_app_values['app_icon'] = '/web/static/img/odoo-icon-512x512.png'
            scoped_app_values['safe_manifest_url'] = "/web/manifest.webmanifest"
        else:
            manifest = modules.module.get_manifest(app_id)
            _app_name = app_name or f"{manifest['name']} ({main_app_name})"
            _path = f"/{path}"
            scoped_app_values['app_summary'] = manifest['summary']
            scoped_app_values['app_category'] = manifest['category']
            scoped_app_values['path'] = _path
            scoped_app_values['app_icon'] = self._get_scoped_app_manifest_icons(app_id)[0]['src']
            scoped_app_values['app_name'] = _app_name
            scoped_app_values['safe_manifest_url'] = f"/web/manifest.scoped_app_manifest?app_id={app_id}&app_name={_app_name}&path={quote(_path)}"

        return request.render('web.webclient_scoped_app', scoped_app_values)

    def _get_scoped_app_manifest_shortcuts(self, app_id):
        return []

    def _get_scoped_app_manifest_icons(self, app_id):
        try:
            # Check whether an svg icon is present in the module. If not, we use the default Odoo icon
            file_path(f'{app_id}/static/description/icon.svg')
            src = f'/{app_id}/static/description/icon.svg'
        except FileNotFoundError:
            src = f"/{self._icon_path()}"
        return [{
            'src': src,
            'sizes': 'any',
            'type': mimetypes.guess_type(src)[0] or 'image/png'
        }]

    @http.route('/web/manifest.scoped_app_manifest', type='http', auth='public', methods=['GET'])
    def scoped_app_manifest(self, app_id, path, app_name=''):
        """ Returns a WebManifest dedicated to the scope of the given app. A custom scope and start
            url are set to make sure no other installed PWA can overlap the scope (e.g. /odoo)
        """
        _app_name = app_name
        if not _app_name and app_id:
            manifest = modules.module.get_manifest(app_id)
            _app_name = manifest['name']
        webmanifest = {
            'name': _app_name,
            'scope': path,
            'start_url': path,
            'display': 'standalone',
            'background_color': '#714B67',
            'theme_color': '#714B67',
            'prefer_related_applications': False,
        }
        webmanifest['icons'] = self._get_scoped_app_manifest_icons(app_id)
        webmanifest['shortcuts'] = self._get_scoped_app_manifest_shortcuts(app_id)
        body = json.dumps(webmanifest, default=ustr)
        response = request.make_response(body, [
            ('Content-Type', 'application/manifest+json'),
        ])
        return response
