# Part of Odoo. See LICENSE file for full copyright and licensing details.
"""
This module is used to provide an azure.storage.blob.generate_blob_sas
compatible function for generating sas URLs for Azure Storage without
importing the azure.storage.blob library.
"""

import base64
import hashlib
import hmac
from urllib.parse import quote
from datetime import date

X_MS_VERSION = '2023-11-03'

def encode_base64(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    encoded = base64.b64encode(data)
    return encoded.decode('utf-8')

def decode_base64_to_bytes(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.b64decode(data)

def sign_string(key, string_to_sign, key_is_base64=True):
    if key_is_base64:
        key = decode_base64_to_bytes(key)
    else:
        if isinstance(key, str):
            key = key.encode('utf-8')
    if isinstance(string_to_sign, str):
        string_to_sign = string_to_sign.encode('utf-8')
    signed_hmac_sha256 = hmac.HMAC(key, string_to_sign, hashlib.sha256)
    digest = signed_hmac_sha256.digest()
    encoded_digest = encode_base64(digest)
    return encoded_digest

def _to_utc_datetime(value):
    return value.strftime('%Y-%m-%dT%H:%M:%SZ')


class QueryStringConstants:
    SIGNED_SIGNATURE = 'sig'
    SIGNED_PERMISSION = 'sp'
    SIGNED_START = 'st'
    SIGNED_EXPIRY = 'se'
    SIGNED_RESOURCE = 'sr'
    SIGNED_IDENTIFIER = 'si'
    SIGNED_IP = 'sip'
    SIGNED_PROTOCOL = 'spr'
    SIGNED_VERSION = 'sv'
    SIGNED_CACHE_CONTROL = 'rscc'
    SIGNED_CONTENT_DISPOSITION = 'rscd'
    SIGNED_CONTENT_ENCODING = 'rsce'
    SIGNED_CONTENT_LANGUAGE = 'rscl'
    SIGNED_CONTENT_TYPE = 'rsct'
    START_PK = 'spk'
    START_RK = 'srk'
    END_PK = 'epk'
    END_RK = 'erk'
    SIGNED_RESOURCE_TYPES = 'srt'
    SIGNED_SERVICES = 'ss'
    SIGNED_OID = 'skoid'
    SIGNED_TID = 'sktid'
    SIGNED_KEY_START = 'skt'
    SIGNED_KEY_EXPIRY = 'ske'
    SIGNED_KEY_SERVICE = 'sks'
    SIGNED_KEY_VERSION = 'skv'
    SIGNED_ENCRYPTION_SCOPE = 'ses'

    # for ADLS
    SIGNED_AUTHORIZED_OID = 'saoid'
    SIGNED_UNAUTHORIZED_OID = 'suoid'
    SIGNED_CORRELATION_ID = 'scid'
    SIGNED_DIRECTORY_DEPTH = 'sdd'


class BlobQueryStringConstants:
    SIGNED_TIMESTAMP = 'snapshot'


class _BlobSharedAccessHelper:
    def __init__(self):
        self.query_dict = {}

    def _add_query(self, name, val):
        if val:
            self.query_dict[name] = str(val) if val is not None else None

    def get_value_to_append(self, query):
        return_value = self.query_dict.get(query) or ''
        return return_value + '\n'

    def add_base(self, permission, expiry, start, ip, protocol, x_ms_version):
        if isinstance(start, date):
            start = _to_utc_datetime(start)

        if isinstance(expiry, date):
            expiry = _to_utc_datetime(expiry)

        self._add_query(QueryStringConstants.SIGNED_START, start)
        self._add_query(QueryStringConstants.SIGNED_EXPIRY, expiry)
        self._add_query(QueryStringConstants.SIGNED_PERMISSION, permission)
        self._add_query(QueryStringConstants.SIGNED_IP, ip)
        self._add_query(QueryStringConstants.SIGNED_PROTOCOL, protocol)
        self._add_query(QueryStringConstants.SIGNED_VERSION, x_ms_version)

    def add_resource(self, resource):
        self._add_query(QueryStringConstants.SIGNED_RESOURCE, resource)

    def add_id(self, policy_id):
        self._add_query(QueryStringConstants.SIGNED_IDENTIFIER, policy_id)

    def add_override_response_headers(self, cache_control,
                                      content_disposition,
                                      content_encoding,
                                      content_language,
                                      content_type):
        self._add_query(QueryStringConstants.SIGNED_CACHE_CONTROL, cache_control)
        self._add_query(QueryStringConstants.SIGNED_CONTENT_DISPOSITION, content_disposition)
        self._add_query(QueryStringConstants.SIGNED_CONTENT_ENCODING, content_encoding)
        self._add_query(QueryStringConstants.SIGNED_CONTENT_LANGUAGE, content_language)
        self._add_query(QueryStringConstants.SIGNED_CONTENT_TYPE, content_type)

    def add_resource_signature(self, account_name, account_key, path):
        # pylint: disable = no-member
        if path[0] != '/':
            path = '/' + path

        canonicalized_resource = '/blob/' + account_name + path + '\n'

        # Form the string to sign from shared_access_policy and canonicalized
        # resource. The order of values is important.
        string_to_sign = \
            (self.get_value_to_append(QueryStringConstants.SIGNED_PERMISSION) +
             self.get_value_to_append(QueryStringConstants.SIGNED_START) +
             self.get_value_to_append(QueryStringConstants.SIGNED_EXPIRY) +
             canonicalized_resource)

        string_to_sign += self.get_value_to_append(QueryStringConstants.SIGNED_IDENTIFIER)

        string_to_sign += \
            (self.get_value_to_append(QueryStringConstants.SIGNED_IP) +
             self.get_value_to_append(QueryStringConstants.SIGNED_PROTOCOL) +
             self.get_value_to_append(QueryStringConstants.SIGNED_VERSION) +
             self.get_value_to_append(QueryStringConstants.SIGNED_RESOURCE) +
             self.get_value_to_append(BlobQueryStringConstants.SIGNED_TIMESTAMP) +
             self.get_value_to_append(QueryStringConstants.SIGNED_ENCRYPTION_SCOPE) +
             self.get_value_to_append(QueryStringConstants.SIGNED_CACHE_CONTROL) +
             self.get_value_to_append(QueryStringConstants.SIGNED_CONTENT_DISPOSITION) +
             self.get_value_to_append(QueryStringConstants.SIGNED_CONTENT_ENCODING) +
             self.get_value_to_append(QueryStringConstants.SIGNED_CONTENT_LANGUAGE) +
             self.get_value_to_append(QueryStringConstants.SIGNED_CONTENT_TYPE))

        # remove the trailing newline
        if string_to_sign[-1] == '\n':
            string_to_sign = string_to_sign[:-1]

        self._add_query(QueryStringConstants.SIGNED_SIGNATURE, sign_string(account_key, string_to_sign))

    def get_token(self):
        # a conscious decision was made to exclude the timestamp in the generated token
        # this is to avoid having two snapshot ids in the query parameters when the user appends the snapshot timestamp
        exclude = [BlobQueryStringConstants.SIGNED_TIMESTAMP]
        return '&'.join([f'{n}={quote(v)}' for n, v in self.query_dict.items() if v is not None and n not in exclude])


def generate_blob_sas(
        account_name,
        container_name,
        blob_name,
        account_key=None,
        permission=None,
        expiry=None,
        start=None,
        policy_id=None,
        ip=None,
        protocol=None,
        cache_control=None,
        content_disposition=None,
        content_encoding=None,
        content_language=None,
        content_type=None,
    ):
    """Generates a shared access signature for a blob.

    This function is a simplified version of the azure.storage.blob.generate_blob_sas
    without supporting parameters: snapshot, user_delegation_key and some **kwargs
    for simplicity. And permission can only be str for simplicity.

    Use the returned signature with the credential parameter of any BlobServiceClient,
    ContainerClient or BlobClient.

    :param str account_name:
        The storage account name used to generate the shared access signature.
    :param str container_name:
        The name of the container.
    :param str blob_name:
        The name of the blob.
    :param str account_key:
        The account key, also called shared key or access key, to generate the shared access signature.
        Either `account_key` or `user_delegation_key` must be specified.
    :param permission:
        The permissions associated with the shared access signature. The
        user is restricted to operations allowed by the permissions.
        Permissions must be ordered racwdxytmei.
        Required unless an id is given referencing a stored access policy
        which contains this field. This field must be omitted if it has been
        specified in an associated stored access policy.
    :type permission: str
    :param expiry:
        The time at which the shared access signature becomes invalid.
        Required unless an id is given referencing a stored access policy
        which contains this field. This field must be omitted if it has
        been specified in an associated stored access policy. Azure will always
        convert values to UTC. If a date is passed in without timezone info, it
        is assumed to be UTC.
    :type expiry: ~datetime.datetime or str
    :param start:
        The time at which the shared access signature becomes valid. If
        omitted, start time for this call is assumed to be the time when the
        storage service receives the request. Azure will always convert values
        to UTC. If a date is passed in without timezone info, it is assumed to
        be UTC.
    :type start: ~datetime.datetime or str
    :param str policy_id:
        A unique value up to 64 characters in length that correlates to a
        stored access policy. To create a stored access policy, use
        :func:`~azure.storage.blob.ContainerClient.set_container_access_policy`.
    :param str ip:
        Specifies an IP address or a range of IP addresses from which to accept requests.
        If the IP address from which the request originates does not match the IP address
        or address range specified on the SAS token, the request is not authenticated.
        For example, specifying ip=168.1.5.65 or ip=168.1.5.60-168.1.5.70 on the SAS
        restricts the request to those IP addresses.
    :keyword str protocol:
        Specifies the protocol permitted for a request made. The default value is https.
    :keyword str cache_control:
        Response header value for Cache-Control when resource is accessed
        using this shared access signature.
    :keyword str content_disposition:
        Response header value for Content-Disposition when resource is accessed
        using this shared access signature.
    :keyword str content_encoding:
        Response header value for Content-Encoding when resource is accessed
        using this shared access signature.
    :keyword str content_language:
        Response header value for Content-Language when resource is accessed
        using this shared access signature.
    :keyword str content_type:
        Response header value for Content-Type when resource is accessed
        using this shared access signature.
    :return: A Shared Access Signature (sas) token.
    :rtype: str
    """
    if not policy_id:
        if not expiry:
            raise ValueError("'expiry' parameter must be provided when not using a stored access policy.")
        if not permission:
            raise ValueError("'permission' parameter must be provided when not using a stored access policy.")

    resource_path = container_name + '/' + blob_name

    sas = _BlobSharedAccessHelper()
    sas.add_base(permission, expiry, start, ip, protocol, X_MS_VERSION)
    sas.add_id(policy_id)

    resource = 'b'
    sas.add_resource(resource)
    sas.add_override_response_headers(cache_control, content_disposition,
                                      content_encoding, content_language,
                                      content_type)
    sas.add_resource_signature(account_name, account_key, resource_path)

    return sas.get_token()
