# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import os

from glob import glob
from logging import getLogger

from odoo.tools import config
from odoo.tools.func import lazy
from odoo.addons import __path__ as ADDONS_PATH
from odoo import api, fields, http, models
from odoo.modules.module import read_manifest


_logger = getLogger(__name__)

SCRIPT_EXTENSIONS = ['js']
STYLE_EXTENSIONS = ['css', 'scss', 'sass', 'less']
TEMPLATE_EXTENSIONS = ['xml']
DEFAULT_SEQUENCE = 16
DIRECTIVES_WITH_TARGET = ['after', 'before', 'replace']


def fs2web(path):
    """Converts a file system path to a web path"""
    return '/'.join(os.path.split(path))

if config['test_enable']:
    def get_all_manifests_cache():
        manifest_cache = {}
        for addons_path in ADDONS_PATH:
            for module in sorted(os.listdir(str(addons_path))):
                if module not in manifest_cache:
                    manifest = read_manifest(addons_path, module)
                    if not manifest or not manifest.get('installable', True):
                        continue
                    manifest['addons_path'] = addons_path
                    manifest_cache[module] = manifest
        return manifest_cache

    http.addons_manifest = lazy(get_all_manifests_cache)

class IrAsset(models.Model):
    """This model contributes to two things:

        1. It exposes a public function returning a list of all file paths
        declared in a given list of addons;

        2. It allows to create 'ir.asset' records to add additional directives
        to certain bundles.
    """
    _name = 'ir.asset'
    _description = 'Asset'
    _order = 'sequence, id'

    @api.model_create_multi
    def create(self, vals_list):
        self.clear_caches()
        return super().create(vals_list)

    def write(self, values):
        self.clear_caches()
        return super().write(values)

    def unlink(self):
        self.clear_caches()
        return super().unlink()

    name = fields.Char(string='Name', required=True)
    bundle = fields.Char(string='Bundle name', required=True)
    directive = fields.Selection(string='Directive', selection=[
        ('append', 'Append'),
        ('prepend', 'Prepend'),
        ('after', 'After'),
        ('before', 'Before'),
        ('remove', 'Remove'),
        ('replace', 'Replace'),
        ('include', 'Include')], default='append')
    glob = fields.Char(string='Path', required=True)
    target = fields.Char(string='Target')
    active = fields.Boolean(string='active', default=True)
    sequence = fields.Integer(string="Sequence", default=DEFAULT_SEQUENCE, required=True)

    def get_asset_paths(self, bundle, addons=None, css=False, js=False, xml=False):
        """
        Fetches all asset file paths from a given list of addons matching a
        certain bundle. The returned list is composed of tuples containing the
        file path [1], the first addon calling it [0] and the bundle name.
        Asset loading is performed as follows:

        1. All 'ir.asset' records matching the given bundle and with a sequence
        strictly less than 16 are applied.

        3. The manifests of the given addons are checked for assets declaration
        for the given bundle. If any, they are read sequentially and their
        operations are applied to the current list.

        4. After all manifests have been parsed, the remaining 'ir.asset'
        records matching the bundle are also applied to the current list.

        :param bundle: name of the bundle from which to fetch the file paths
        :param addons: list of addon names as strings. The files returned will
            only be contained in the given addons.
        :param css: boolean: whether or not to include style files
        :param js: boolean: whether or not to include script files
        :param xml: boolean: whether or not to include template files
        :returns: the list of tuples (path, addon, bundle)
        """
        if addons is None:
            addons = self._get_addons_list()

        asset_paths = AssetPaths()
        self._fill_asset_paths(bundle, addons, css, js, xml, asset_paths, [])
        return asset_paths.list

    def _fill_asset_paths(self, bundle, addons, css, js, xml, asset_paths, seen):
        """
        Fills the given AssetPaths instance by applying the operations found in
        the matching bundle of the given addons manifests.
        See `get_asset_paths` for more information.

        :param bundle: name of the bundle from which to fetch the file paths
        :param addons: list of addon names as strings
        :param css: boolean: whether or not to include style files
        :param js: boolean: whether or not to include script files
        :param xml: boolean: whether or not to include template files
        :param asset_paths: the AssetPath object to fill
        :param seen: a list of bundles already checked to avoid circularity
        """
        if bundle in seen:
            raise Exception("Circular assets bundle declaration: %s" % " > ".join(seen + [bundle]))

        manifest_cache = self._get_manifest_cache()
        exts = []
        if js:
            exts += SCRIPT_EXTENSIONS
        if css:
            exts += STYLE_EXTENSIONS
        if xml:
            exts += TEMPLATE_EXTENSIONS

        # this index is used for prepending: files are inserted at the beginning
        # of the CURRENT bundle.
        bundle_start_index = len(asset_paths.list)

        def process_path(directive, target, path_def):
            """
            This sub function is meant to take a directive and a set of
            arguments and apply them to the current asset_paths list
            accordingly.

            It is nested inside `get_asset_paths` since we need the current
            list of addons, extensions, asset_paths and manifest_cache.

            :param directive: string
            :param target: string or None or False
            :param path_def: string
            """
            if directive == 'include':
                # recursively call this function for each 'include' directive.
                self._fill_asset_paths(path_def, addons, css, js, xml, asset_paths, seen + [bundle])
                return

            addon, paths = self._get_paths(path_def, addons, exts)

            # retrieve target index when it applies
            if directive in DIRECTIVES_WITH_TARGET:
                _, target_paths = self._get_paths(target, addons, exts)
                if not target_paths:
                    # nothing to do: possibly the target has the wrong extension
                    return
                target_index = asset_paths.index(target_paths[0], addon, bundle)

            if directive == 'append':
                asset_paths.append(paths, addon, bundle)
            elif directive == 'prepend':
                asset_paths.insert(paths, addon, bundle, bundle_start_index)
            elif directive == 'after':
                asset_paths.insert(paths, addon, bundle, target_index + 1)
            elif directive == 'before':
                asset_paths.insert(paths, addon, bundle, target_index)
            elif directive == 'remove':
                asset_paths.remove(paths, addon, bundle)
            elif directive == 'replace':
                asset_paths.insert(paths, addon, bundle, target_index)
                asset_paths.remove(target_paths, addon, bundle)
            else:
                # this should never happen
                raise ValueError("Unexpected directive")

        # 1. Process the first sequence of 'ir.asset' records
        assets = self.sudo().search(self._get_asset_domain(bundle), order='sequence, id')
        for asset in assets.filtered(lambda a: a.sequence < DEFAULT_SEQUENCE):
            process_path(asset.directive, asset.target, asset.glob)

        # 2. Process all addons' manifests.
        for addon in addons:
            manifest = manifest_cache.get(addon)
            if not manifest:
                continue
            manifest_assets = manifest.get('assets', {})
            for command in manifest_assets.get(bundle, []):
                if isinstance(command, str):
                    # Default directive: append
                    directive, target, path_def = 'append', None, command
                elif command[0] in DIRECTIVES_WITH_TARGET:
                    directive, target, path_def = command
                else:
                    directive, path_def = command
                    target = None
                process_path(directive, target, path_def)

        # 3. Process the rest of 'ir.asset' records
        for asset in assets.filtered(lambda a: a.sequence >= DEFAULT_SEQUENCE):
            process_path(asset.directive, asset.target, asset.glob)

    def get_related_bundle(self, target_path_def, root_bundle):
        """
        Returns the first bundle directly defining a glob matching the target
        path. This is useful when generating an 'ir.asset' record to override
        a specific asset and target the right bundle, i.e. the first one
        defining the target path.

        :param target_path_def: string: path to match.
        :root_bundle: string: bundle from which to initiate the search.
        :returns: the first matching bundle or None
        """
        ext = target_path_def.split('.')[-1]
        addons = self._get_addons_list()
        target_path = self._get_paths(target_path_def, addons)[1][0]

        css = ext in STYLE_EXTENSIONS
        js = ext in SCRIPT_EXTENSIONS
        xml = ext in TEMPLATE_EXTENSIONS

        asset_paths = self.get_asset_paths(root_bundle, addons, css, js, xml)

        for path, _, bundle in asset_paths:
            if path == target_path:
                return bundle

        return root_bundle

    def _get_addons_list(self):
        """
        Returns the list of addons to take into account when loading assets.
        Can be overridden to filter the returned list of modules.
        :returns: string[]: list of module names
        """
        if not http.request:
            return self.env['ir.module.module'].sudo()._installed_sorted()
        else:
            return http.module_boot()

    def _get_asset_domain(self, bundle):
        """Meant to be overridden to add additional parts to the search domain"""
        return [('bundle', '=', bundle), ('active', '=', True)]

    def _get_manifest_cache(self):
        """Proxy to the http addons manifest, used for test overrides."""
        return http.addons_manifest

    def _get_paths(self, path_def, addons, extensions=None):
        """
        Returns a list of file paths matching a given glob (path_def) as well as
        the addon targetted by the path definition. If no file matches that glob,
        the path definition is returned as is. This is either because the glob is
        not correctly written or because it points to an URL.

        :param path_def: the definition (glob) of file paths to match
        :param addons: the list of installed addons
        :param extensions: a list of extensions that found files must match
        :returns: a tuple: the addon targetted by the path definition [0] and the
            list of glob files matching the definition [1] (or the glob itself if
            none). Note that these paths are filtered on the given `extensions`.
        """
        paths = []
        path_url = fs2web(path_def)
        path_parts = [part for part in path_url.split('/') if part]
        addon = path_parts[0]
        addon_manifest = self._get_manifest_cache().get(addon)

        if addon_manifest:
            if addon not in addons:
                raise Exception("Unallowed to fetch files from addon %s" % addon)
            addons_path = os.path.join(addon_manifest['addons_path'], '')[:-1]
            full_path = os.path.normpath(os.path.join(addons_path, *path_parts))
            # When fetching template file paths, we need the full paths since xml
            # files are read from the file system. But web assets (scripts and
            # stylesheets) must be loaded using relative paths, hence the trimming
            # for non-xml file paths.
            paths = [
                path if path.split('.')[-1] in TEMPLATE_EXTENSIONS else path[len(addons_path):]
                for path in sorted(glob(full_path, recursive=True))
            ]
        else:
            addon = None

        if not paths:
            # No file matching the path; the path_def is considered as a URL (or a
            # miswritten glob, resulting in a console error).
            paths = [path_url if not addon or path_url.startswith('/') else '/' + path_url]

        # Paths are filtered on the extensions (if any).
        return addon, [
            path
            for path in paths
            if not extensions or path.split('.')[-1] in extensions
        ]


class AssetPaths:
    """ A list of asset paths (path, addon, bundle) with efficient operations. """
    def __init__(self):
        self.list = []
        self.memo = set()

    def index(self, path, addon, bundle):
        """Returns the index of the given path in the current assets list."""
        if path not in self.memo:
            raise ValueError("File %s not found in bundle %s" % (path, bundle))
        for index, asset in enumerate(self.list):
            if asset[0] == path:
                return index

    def append(self, paths, addon, bundle):
        """Appends the given paths to the current list."""
        for path in paths:
            if path not in self.memo:
                self.list.append((path, addon, bundle))
                self.memo.add(path)

    def insert(self, paths, addon, bundle, index):
        """Inserts the given paths to the current list at the given position."""
        to_insert = []
        for path in paths:
            if path not in self.memo:
                to_insert.append((path, addon, bundle))
                self.memo.add(path)
        self.list[index:index] = to_insert

    def remove(self, paths, addon, bundle):
        """Removes the given paths from the current list."""
        paths = {path for path in paths if path in self.memo}
        if paths:
            self.list[:] = [asset for asset in self.list if asset[0] not in paths]
            self.memo.difference_update(paths)
