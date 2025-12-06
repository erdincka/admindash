import React, { useEffect, useRef } from 'react';
import { Terminal as XTerm } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { Box } from 'grommet';
import { io, Socket } from 'socket.io-client';

interface TerminalProps {
    namespace: string;
    pod: string;
    container: string;
    command?: string | string[];
}

const Terminal: React.FC<TerminalProps> = ({
    namespace,
    pod,
    container,
    command = '/bin/sh'
}) => {
    const terminalRef = useRef<HTMLDivElement>(null);
    const xtermRef = useRef<XTerm | null>(null);
    const socketRef = useRef<Socket | null>(null);
    const fitAddonRef = useRef<FitAddon | null>(null);

    useEffect(() => {
        if (!terminalRef.current) return;

        // Initialize xterm
        const term = new XTerm({
            cursorBlink: true,
            theme: {
                background: '#1e1e1e',
                foreground: '#ffffff',
            },
            fontSize: 14,
            fontFamily: 'Menlo, Monaco, "Courier New", monospace',
            convertEol: true,
            rows: 24, // Default rows
            cols: 80, // Default cols
        });

        const fitAddon = new FitAddon();
        term.loadAddon(fitAddon);

        xtermRef.current = term;
        fitAddonRef.current = fitAddon;

        let opened = false;

        // Use ResizeObserver to handle fitting and initial open
        const resizeObserver = new ResizeObserver(() => {
            if (!terminalRef.current) return;

            // Check if container has dimensions
            if (terminalRef.current.clientWidth > 0 && terminalRef.current.clientHeight > 0) {
                if (!opened) {
                    term.open(terminalRef.current);
                    opened = true;
                }

                // Use requestAnimationFrame to ensure layout is complete
                requestAnimationFrame(() => {
                    try {
                        // Only fit if terminal is opened and has an element
                        if (opened && term.element && term.element.clientWidth > 0) {
                            fitAddon.fit();
                            const { cols, rows } = term;
                            socketRef.current?.emit('terminal:resize', { cols, rows });
                        }
                    } catch (e) {
                        console.warn("Failed to fit terminal:", e);
                    }
                });
            }
        });

        resizeObserver.observe(terminalRef.current);

        // Initialize socket connection
        const apiUrl = process.env.NEXT_PUBLIC_API_URL || '/api/v1';
        // Remove /api/v1 suffix to get base URL
        const baseUrl = apiUrl.replace(/\/api\/v1\/?$/, '');

        const socket = io(baseUrl, {
            path: '/socket.io',
            transports: ['websocket'],
            reconnection: false // Don't reconnect automatically for terminal sessions
        });

        socketRef.current = socket;

        socket.on('connect', () => {
            // Wait for terminal to be opened before writing
            const writeConnectMessage = () => {
                if (opened) {
                    term.write('\r\n*** Connected to backend ***\r\n');
                } else {
                    setTimeout(writeConnectMessage, 100);
                }
            };
            writeConnectMessage();

            // Start terminal session
            socket.emit('terminal:start', {
                namespace,
                pod,
                container,
                command
            });

            // Send an enter key to trigger prompt
            setTimeout(() => {
                socket.emit('terminal:input', '\r');
            }, 1000);
        });

        socket.on('terminal:output', (data: string) => {
            // console.debug("Terminal output:", data);
            term.write(data);
        });

        socket.on('disconnect', () => {
            term.write('\r\n*** Disconnected from backend ***\r\n');
        });

        socket.on('error', (err: any) => {
            term.write(`\r\n*** Error: ${err.message || JSON.stringify(err)} ***\r\n`);
        });

        // Handle user input
        // Rely on PTY for echo and history
        term.onData((data) => {
            // console.debug("Terminal input:", data);
            socket.emit('terminal:input', data);
        });


        return () => {
            resizeObserver.disconnect();
            socket.disconnect();
            term.dispose();
        };
    }, [namespace, pod, container, command]);

    return (
        <Box
            ref={terminalRef}
            fill
            background="#1e1e1e"
            style={{ overflow: 'hidden', padding: '10px', minHeight: '300px' }}
        />
    );
};

export default Terminal;
