import contextlib
import logging
import smtplib
import socket
import ssl
import unittest
import warnings
from base64 import b64encode
from pathlib import Path
from unittest.mock import patch
from socket import getaddrinfo  # keep a reference on the non-patched function

from odoo import modules
from odoo.exceptions import UserError
from odoo.tools import config, file_path, mute_logger
from .common import TransactionCaseWithUserDemo

try:
    import aiosmtpd
    import aiosmtpd.controller
    import aiosmtpd.smtp
    import aiosmtpd.handlers
except ImportError:
    aiosmtpd = None


PASSWORD = 'secretpassword'
_logger = logging.getLogger(__name__)

DEFAULT_SMTP_CONFIG = {
    'email_from': False,
    'from_filter': False,
    'smtp_server': 'localhost',
    'smtp_port': 25,
    'smtp_ssl': 'none',
    'smtp_user': False,
    'smtp_password': False,
    'smtp_ssl_certificate_filename': False,
    'smtp_ssl_private_key_filename': False,
}


def _find_free_local_address():
    """ Get a triple (family, address, port) on which it possible to bind
    a local tcp service. """
    addr = aiosmtpd.controller.get_localhost()  # it returns 127.0.0.1 or ::1
    family = socket.AF_INET if addr == '127.0.0.1' else socket.AF_INET6
    with socket.socket(family, socket.SOCK_STREAM) as sock:
        sock.bind((addr, 0))
        port = sock.getsockname()[1]
    return family, addr, port


def _smtp_authenticate(server, session, enveloppe, mechanism, data):
    """ Callback method used by aiosmtpd to validate a login/password pair. """
    result = aiosmtpd.smtp.AuthResult(success=data.password == PASSWORD.encode())
    _logger.debug("AUTH %s", "successfull" if result.success else "failed")
    return result


class Certificate:
    def __init__(self, key, cert):
        self.key = key and Path(file_path(key, filter_ext='.pem'))
        self.cert = Path(file_path(cert, filter_ext='.pem'))

    def __repr__(self):
        return f"Certificate({self.key=}, {self.cert=})"


class Mixin:
    @classmethod
    def setUpClass(cls):
        super().setUpClass()

        # aiosmtpd emits deprecation warnings because it uses its own
        # deprecated features, mute those logs.
        # https://github.com/aio-libs/aiosmtpd/issues/347
        class Session(aiosmtpd.smtp.Session):
            @property
            def login_data(self):
                return self._login_data
            @login_data.setter
            def login_data(self, value):
                self._login_data = value
        patcher = patch('aiosmtpd.smtp.Session', Session)
        patcher.start()
        cls.addClassCleanup(patcher.stop)

        # aiosmtpd emits warnings for some unusual configuration, like
        # requiring AUTH on a clear-text transport. Mute those logs
        # since we also test those unusual configurations.
        warnings.filterwarnings(
            'ignore',
            "Requiring AUTH while not requiring TLS can lead to security vulnerabilities!",
            category=UserWarning
        )
        class CustomFilter(logging.Filter):
            def filter(self, record):
                if record.msg == "auth_required == True but auth_require_tls == False":
                    return False
                if record.msg == "tls_context.verify_mode not in {CERT_NONE, CERT_OPTIONAL}; this might cause client connection problems":
                    return False
                return True
        logging.getLogger('mail.log').addFilter(CustomFilter())

        # decrease aiosmtpd verbosity, odoo INFO = aiosmtpd WARNING
        logging.getLogger('mail.log').setLevel(_logger.getEffectiveLevel() + 10)

        # Get various TLS keys and certificates. CA was used to sign
        # both client and server. self_signed is... self signed.
        cls.ssl_ca, cls.ssl_client, cls.ssl_server, cls.ssl_self_signed = [
            Certificate(None, 'base/tests/ssl/ca.cert.pem'),
            Certificate('base/tests/ssl/client.key.pem',
                        'base/tests/ssl/client.cert.pem'),
            Certificate('base/tests/ssl/server.key.pem',
                        'base/tests/ssl/server.cert.pem'),
            Certificate('base/tests/ssl/self_signed.key.pem',
                        'base/tests/ssl/self_signed.cert.pem'),
        ]

        # Patch the two SMTP client classes into trusting the above CA
        class TEST_SMTP(smtplib.SMTP):
            def starttls(self, *, context):
                if context is None:
                    context = ssl._create_stdlib_context()  # what SMTP_SSL does
                    # context = ssl.create_default_context()  # what it should do
                context.load_verify_locations(cafile=str(cls.ssl_ca.cert))
                super().starttls(context=context)
        class TEST_SMTP_SSL(smtplib.SMTP_SSL):
            def _get_socket(self, *args, **kwargs):
                # self.context = ssl.create_default_context()  # what it should do
                self.context.load_verify_locations(cafile=str(cls.ssl_ca.cert))
                return super()._get_socket(*args, **kwargs)
        patcher = patch('smtplib.SMTP', TEST_SMTP)
        patcher.start()
        cls.addClassCleanup(patcher.stop)
        patcher = patch('smtplib.SMTP_SSL', TEST_SMTP_SSL)
        patcher.start()
        cls.addClassCleanup(patcher.stop)

        # reactivate sending emails during this test suite, make sure
        # NOT TO send emails using another ir.mail_server than the one
        # created in setUp!
        patcher = patch.object(modules.module, 'current_test', False)
        patcher.start()
        cls.addClassCleanup(patcher.stop)

        # fix runbot, docker uses a single ipv4 stack but it gives ::1
        # when resolving "localhost" (so stupid), use the following to
        # force aiosmtpd/odoo to bind/connect to a fixed ipv4 OR ipv6
        # address.
        family, _, cls.port = _find_free_local_address()
        cls.localhost = getaddrinfo('localhost', cls.port, family)
        cls.startClassPatcher(patch('socket.getaddrinfo', cls.getaddrinfo))

    def setUp(self):
        super().setUp()

        # prevent the current configuration from interfering with the tests
        self.config = self.startPatcher(
            patch.dict('odoo.tools.config.options', DEFAULT_SMTP_CONFIG)
        )

        self.mail_server = self.env['ir.mail_server'].create({'name': 'test smtpd'})
        self.mail_server_write({
            'from_filter': 'localhost',
            'smtp_host': 'localhost',
            'smtp_port': self.port,
        })

    def mail_server_write(self):
        raise NotImplementedError("abstract method")

    @classmethod
    def getaddrinfo(cls, host, port, *args, **kwargs):
        """
        Resolve both "localhost" and "notlocalhost" on the ip address
        bound by aiosmtpd inside `start_smtpd`.
        """
        if host in ('localhost', 'notlocalhost') and port == cls.port:
            return cls.localhost
        return getaddrinfo(host, port, family=0, type=0, proto=0, flags=0)

    @contextlib.contextmanager
    def start_smtpd(
        self, encryption, ssl_context=None, auth_required=True, stop_on_cleanup=True
    ):
        """
        Start a smtp daemon in a background thread, stop it upon exiting
        the context manager.

        :param encryption: 'none', 'ssl' or 'starttls', the kind of
            server to start.
        :param ssl_context: the ``ssl.SSLContext`` object to use with
            'ssl' or 'starttls'.
        :param auth_required: whether the server enforces password
            authentication or not.
        """
        encryption = encryption.removesuffix('_strict')
        assert encryption in ('none', 'ssl', 'starttls')
        assert encryption == 'none' or ssl_context

        kwargs = {}
        if encryption == 'starttls':
            # for aiosmtpd.smtp.SMTP
            kwargs.update({
                'require_starttls': True,
                'tls_context': ssl_context,
            })
        elif encryption == 'ssl':
            # for aiosmtpd.controller.InetMixin
            kwargs['ssl_context'] = ssl_context
        if auth_required:
            kwargs['authenticator'] = _smtp_authenticate

        smtpd_thread = aiosmtpd.controller.Controller(
            aiosmtpd.handlers.Debugging(),
            hostname=aiosmtpd.controller.get_localhost(),
            server_hostname='localhost',
            port=self.port,
            auth_required=auth_required,
            auth_require_tls=False,
            enable_SMTPUTF8=True,
            **kwargs,
        )
        try:
            smtpd_thread.start()
            yield smtpd_thread
        finally:
            smtpd_thread.stop()

    @mute_logger('mail.log')
    def test_authentication_certificate_matrix(self):
        """
        Connect to a server that is authenticating users via a TLS
        certificate. Test the various possible configurations (missing
        cert, invalid cert and valid cert) against both a STARTTLS and
        a SSL/TLS SMTP server.
        """
        self.mail_server_write({
            'smtp_authentication': 'login',
            'smtp_user': '',
            'smtp_pass': '',
        })

        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(self.ssl_server.cert, self.ssl_server.key)
        ssl_context.load_verify_locations(cafile=self.ssl_ca.cert)
        ssl_context.verify_mode = ssl.CERT_REQUIRED

        matrix = [
            # authentication, name, certificate, private key, error pattern
            ('login', "missing", '', '',
                r"The server has closed the connection unexpectedly\. "
                r"Check configuration served on this port number\.\n "
                r"Connection unexpectedly closed"),
            ('certificate', "self signed", self.ssl_self_signed.cert, self.ssl_self_signed.key,
                r"The server has closed the connection unexpectedly\. "
                r"Check configuration served on this port number\.\n "
                r"Connection unexpectedly closed"),
            ('certificate', "valid client", self.ssl_client.cert, self.ssl_client.key, None),
        ]

        for encryption in ('starttls', 'ssl'):
            with self.start_smtpd(encryption, ssl_context, auth_required=False):
                for authentication, name, certificate, private_key, error_pattern in matrix:
                    with self.subTest(encryption=encryption, certificate=name):
                        self.mail_server_write({
                            'smtp_encryption': encryption,
                            'smtp_authentication': authentication,
                            'smtp_ssl_certificate': certificate,
                            'smtp_ssl_private_key': private_key,
                        })
                        if error_pattern:
                            with self.assertRaises(UserError) as error_capture:
                                self.mail_server.test_smtp_connection()
                            self.assertRegex(error_capture.exception.args[0], error_pattern)
                        else:
                            self.mail_server.test_smtp_connection()


    def test_authentication_login_matrix(self):
        """
        Connect to a server that is authenticating users via a login/pwd
        pair. Test the various possible configurations (missing pair,
        invalid pair and valid pair) against both a SMTP server without
        encryption, a STARTTLS and a SSL/TLS SMTP server.
        """
        self.mail_server_write({
            'smtp_authentication': 'login',
            'smtp_user': '',
            'smtp_pass': '',
        })

        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(self.ssl_server.cert, self.ssl_server.key)

        MISSING = ''
        INVALID = 'bad password'
        matrix = [
            # auth_required, password, error_pattern
            (False, MISSING, None),
            (True, MISSING,
                r"The server refused the sender address \(\w+@[\w.]+\) "
                r"with error b'5\.7\.0 Authentication required'"),
            (True, INVALID,
                r"The server has closed the connection unexpectedly\. "
                r"Check configuration served on this port number\.\n "
                r"Connection unexpectedly closed:.* timed out"),
            (True, PASSWORD, None),
        ]

        for encryption in ('none', 'starttls', 'starttls_strict', 'ssl', 'ssl_strict'):
            for auth_required, password, error_pattern in matrix:
                self.mail_server_write({
                    'smtp_encryption': encryption,
                    'smtp_user': password and self.user_demo.email,
                    'smtp_pass': password,
                })
                with self.subTest(encryption=encryption,
                                  auth_required=auth_required,
                                  password=password):
                    with self.start_smtpd(encryption, ssl_context, auth_required):
                        if error_pattern:
                            with self.assertRaises(UserError) as capture:
                                self.mail_server.test_smtp_connection()
                            self.assertRegex(capture.exception.args[0], error_pattern)
                        else:
                            self.mail_server.test_smtp_connection()

    @mute_logger('mail.log')
    def test_encryption_matrix(self):
        """
        Connect to a server on a different encryption configuration than
        the server is configured. Verify that it crashes with a good
        error message.
        """
        self.mail_server_write({
            'smtp_authentication': 'login',
            'smtp_user': '',
            'smtp_pass': '',
        })

        ssl_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        ssl_context.load_cert_chain(self.ssl_server.cert, self.ssl_server.key)

        matrix = [
            # client, server, error_pattern
            ('none', 'ssl',
                r"The server has closed the connection unexpectedly\. "
                r"Check configuration served on this port number\.\n "
                r"Connection unexpectedly closed: timed out"),
            ('none', 'starttls',
                r"The server refused the sender address \(\w+@[\w.]+\) with error "
                r"b'Must issue a STARTTLS command first'"),
            ('starttls', 'none',
                r"An option is not supported by the server:\n "
                r"STARTTLS extension not supported by server\."),
            ('starttls', 'ssl',
                r"The server has closed the connection unexpectedly\. "
                r"Check configuration served on this port number\.\n "
                r"Connection unexpectedly closed: timed out"),
            ('ssl', 'none',
                r"An SSL exception occurred\. "
                r"Check connection security type\.\n "
                r".*?wrong version number"),
            ('ssl', 'starttls',
                r"An SSL exception occurred\. "
                r"Check connection security type\.\n "
                r".*?wrong version number"),
        ]

        for client_encryption, server_encryption, error_pattern in matrix:
            with self.subTest(server_encryption=server_encryption,
                              client_encryption=client_encryption):
                self.mail_server_write({'smtp_encryption': client_encryption})
                with self.start_smtpd(server_encryption, ssl_context, auth_required=False):
                    with self.assertRaises(UserError) as capture:
                        self.mail_server.test_smtp_connection()
                    self.assertRegex(capture.exception.args[0], error_pattern)

    @mute_logger('mail.log')
    def test_man_in_the_middle_matrix(self):
        """
        Simulate that a pirate was successful at intercepting the live
        traffic in between the Odoo server and the legitimate SMTP
        server.
        """
        cert_good = self.ssl_server
        cert_bad = self.ssl_self_signed
        host_good = 'localhost'
        host_bad = 'notlocalhost'

        matrix = [
            # strict?, authentication, certificate, hostname, error_pattern
            (False, 'login', cert_bad, host_good, None),
            (False, 'login', cert_good, host_bad, None),
            (False, 'certificate', cert_bad, host_good, None),
            (False, 'certificate', cert_good, host_bad, None),
            (True, 'login', cert_bad, host_good,
                r"^An SSL exception occurred\. Check connection security type\.\n "
                r".*certificate verify failed"),
            (True, 'login', cert_good, host_bad,
                r"^An SSL exception occurred\. Check connection security type\.\n "
                r".*("
                    r"Hostname mismatch, certificate is not valid for 'notlocalhost'"
                r"|"
                    r"hostname 'notlocalhost' doesn't match 'localhost'"
                r")"
            ),
            (True, 'certificate', cert_bad, host_good,
                r"^An SSL exception occurred\. Check connection security type\.\n "
                r".*certificate verify failed"),
            (True, 'certificate', cert_good, host_bad,
                r"^An SSL exception occurred\. Check connection security type\.\n "
                r".*("
                    r"Hostname mismatch, certificate is not valid for 'notlocalhost'"
                r"|"
                    r"hostname 'notlocalhost' doesn't match 'localhost'"
                r")"
                ),
        ]

        for encryption in ('starttls', 'ssl'):
            for strict, authentication, certificate, hostname, error_pattern in matrix:
                self.mail_server_write({
                    'smtp_host': hostname,
                    'smtp_authentication': authentication,
                    'smtp_encryption': encryption + ('_strict' if strict else ''),
                    **({
                        'smtp_user': self.user_demo.email,
                        'smtp_pass': PASSWORD,
                        'smtp_ssl_certificate': '',
                        'smtp_ssl_private_key': '',
                    } if authentication == 'login' else {
                        'smtp_user': '',
                        'smtp_pass': '',
                        'smtp_ssl_certificate': self.ssl_client.cert,
                        'smtp_ssl_private_key': self.ssl_client.key,
                    })
                })
                with self.subTest(
                    encryption=encryption + ('_strict' if strict else ''),
                    authentication=authentication,
                    cert_good=certificate == cert_good,
                    host_good=hostname == host_good,
                ):
                    mitm_context = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
                    mitm_context.load_cert_chain(certificate.cert, certificate.key)
                    auth_required = authentication == 'login'
                    with self.start_smtpd(encryption, mitm_context, auth_required=auth_required):
                        if error_pattern:
                            with self.assertRaises(UserError) as capture:
                                self.mail_server.test_smtp_connection()
                            self.assertRegex(capture.exception.args[0], error_pattern)
                        else:
                            self.mail_server.test_smtp_connection()


# skip when optional dependencies are not found
@unittest.skipUnless(aiosmtpd, "aiosmtpd couldn't be imported")
# fail fast for timeout errors
@patch('odoo.addons.base.models.ir_mail_server.SMTP_TIMEOUT', .1)
class TestIrMailServerSMTPD(Mixin, TransactionCaseWithUserDemo):
    def mail_server_write(self, values):
        # this method is override in TestCliMailServerSMTPD so it writes
        # the values in the config instead of on the recordset.
        cert = values.get('smtp_ssl_certificate')
        if cert:
            values['smtp_ssl_certificate'] = b64encode(cert.read_bytes())
        key = values.get('smtp_ssl_private_key')
        if key:
            values['smtp_ssl_private_key'] = b64encode(key.read_bytes())
        self.mail_server.write(values)


IR_TO_CLI = {
    'smtp_host': 'smtp_server',
    'smtp_pass': 'smtp_password',
    'smtp_encryption': 'smtp_ssl',
    'smtp_ssl_certificate': 'smtp_ssl_certificate_filename',
    'smtp_ssl_private_key': 'smtp_ssl_private_key_filename',
}


# skip when optional dependencies are not found
@unittest.skipUnless(aiosmtpd, "aiosmtpd couldn't be imported")
# fail fast for timeout errors
@patch('odoo.addons.base.models.ir_mail_server.SMTP_TIMEOUT', .1)
class TestCliMailServerSMTPD(Mixin, TransactionCaseWithUserDemo):
    def setUp(self):
        super().setUp()
        self.mail_server.smtp_authentication = 'cli'

    def mail_server_write(self, values):
        sentinel = object()
        for ir, cli in IR_TO_CLI.items():
            value = values.pop(ir, sentinel)
            if value is not sentinel:
                values[cli] = str(value)
        values.pop('smtp_authentication', None)
        self.assertFalse(set(values) - set(DEFAULT_SMTP_CONFIG))
        self.config.update(values)
