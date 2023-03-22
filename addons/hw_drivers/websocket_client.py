# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.

import json
import logging
import time
from threading import Thread
import urllib.parse
import urllib3
import websocket

from odoo.addons.hw_drivers import main
from odoo.addons.hw_drivers.tools import helpers

_logger = logging.getLogger(__name__)

def send_to_controller(print_id, device_identifier):
    server = helpers.get_odoo_server_url()
    try:
        urllib3.disable_warnings()
        http = urllib3.PoolManager(cert_reqs='CERT_NONE')
        http.request(
            'POST',
            server + "/iot/printer/status",
            body=json.dumps(
                {'params': {
                    'print_id': print_id,
                    'device_identifier': device_identifier,
                    }}).encode('utf8'),
            headers={
                'Content-type': 'application/json',
                'Accept': 'text/plain',
            },
        )
    except Exception as e:
        _logger.error('Could not reach configured server')
        _logger.error('A error encountered : %s ', e)


def on_message(ws, messages):
    """
        When a message is receive, this function is triggered
        The message is load and if its type is 'print', is sent to the printer
    """
    messages = json.loads(messages)
    for document in messages:
        if (document['message']['type'] == 'print'):
            payload = document['message']['payload']
            if helpers.get_mac_address() in payload['iotDevice']['iotIdentifiers']:
                #send box confirmation
                for device in payload['iotDevice']['identifiers']:
                    if device['identifier'] in main.iot_devices:
                        main.iot_devices[device["identifier"]]._action_default(payload)
                        send_to_controller(payload['print_id'], device['identifier'])


def on_error(ws, error):
    _logger.error(error)

class WebsocketClient(Thread):
    iot_channel = ""

    def on_open(self, ws):
        """
            When the client is setup, this function send a message to subscribe to the iot websocket channel
        """
        ws.send(
            json.dumps({'event_name': 'subscribe', 'data': {'channels':[self.iot_channel], 'last': 0}})
        )

    def __init__(self, url):
        if url:
            url_parsed = urllib.parse.urlparse(url)
            self.url =  url_parsed._replace(scheme=url_parsed.scheme.replace("http", "ws", 1), path=url_parsed.path + "/websocket").geturl()
            Thread.__init__(self)
            self.ws = ""

    def start_client(self):
        self.ws = websocket.WebSocketApp(self.url,
            on_open=self.on_open, on_message=on_message,
            on_error=on_error)
        while 1:
            self.ws.run_forever()
            time.sleep(10) # Wait 10 seconds before each attempt to connect

    def run(self):
        self.start_client()
