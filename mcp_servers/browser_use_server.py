#!/usr/bin/env python3
"""
Browser Use MCP Server — Meilenstein 2

Stellt Browser-Automatisierung als MCP-Tools bereit.
Wird vom Jarvis-Orchestrator als Kindprozess gestartet und über stdio (JSON-RPC) gesteuert.

Voraussetzungen (in .venv installieren):
    pip install mcp browser-use playwright langchain-ollama
    playwright install chromium
"""

import asyncio
import base64
import os
import sys
from typing import Any

# Umgebungsvariablen aus MCP-Konfiguration lesen
OLLAMA_BASE_URL = os.environ.get("OLLAMA_BASE_URL", "http://localhost:11434")
MODEL = os.environ.get("MODEL", "qwen2.5:7b-instruct")


def _log(msg: str) -> None:
    """Schreibt Logs nach stderr (nicht nach stdout, da stdout für JSON-RPC reserviert ist)."""
    print(f"[browser-use-server] {msg}", file=sys.stderr, flush=True)


try:
    from mcp.server import Server
    from mcp.server.stdio import stdio_server
    from mcp import types as mcp_types
except ImportError:
    _log("FEHLER: 'mcp'-Paket nicht installiert. Bitte: pip install mcp")
    sys.exit(1)

# MCP-Server-Instanz
server = Server("browser-use-jarvis")

# Tool-Definitionen
TOOLS = [
    mcp_types.Tool(
        name="browser_run_task",
        description=(
            "Führt eine Browser-Aufgabe aus. Der Agent navigiert zu Webseiten, "
            "klickt Elemente, füllt Formulare aus, liest Inhalte und gibt eine "
            "Zusammenfassung zurück. Gibt auch einen Screenshot des Endergebnisses zurück."
        ),
        inputSchema={
            "type": "object",
            "properties": {
                "task": {
                    "type": "string",
                    "description": (
                        "Die auszuführende Aufgabe in natürlicher Sprache. "
                        "Beispiele: 'Öffne google.com und suche nach Katzen', "
                        "'Gehe zu github.com und zeige die trending repositories'"
                    )
                }
            },
            "required": ["task"]
        }
    ),
    mcp_types.Tool(
        name="browser_screenshot",
        description=(
            "Nimmt einen Screenshot des aktuellen Browser-Zustands auf. "
            "Nützlich um zu prüfen, was der Browser gerade anzeigt."
        ),
        inputSchema={
            "type": "object",
            "properties": {}
        }
    )
]


@server.list_tools()
async def list_tools() -> list[mcp_types.Tool]:
    """Gibt alle verfügbaren Tools zurück."""
    return TOOLS


@server.call_tool()
async def call_tool(
    name: str,
    arguments: dict[str, Any]
) -> list[mcp_types.TextContent | mcp_types.ImageContent]:
    """Führt das angeforderte Tool aus."""
    _log(f"Tool aufgerufen: {name}, Argumente: {arguments}")

    if name == "browser_run_task":
        task = arguments.get("task", "")
        if not task:
            return [mcp_types.TextContent(type="text", text="Fehler: Kein Task angegeben.")]
        return await _run_browser_task(task)

    if name == "browser_screenshot":
        return await _take_standalone_screenshot()

    return [mcp_types.TextContent(type="text", text=f"Unbekanntes Tool: {name}")]


async def _run_browser_task(
    task: str
) -> list[mcp_types.TextContent | mcp_types.ImageContent]:
    """
    Führt eine Aufgabe mit dem browser-use-Agenten aus.
    Gibt das Ergebnis als Text und einen abschließenden Screenshot zurück.
    """
    try:
        from langchain_ollama import ChatOllama  # type: ignore[import]
        from browser_use import Agent  # type: ignore[import]
        from browser_use.browser.browser import Browser, BrowserConfig  # type: ignore[import]
    except ImportError as e:
        return [mcp_types.TextContent(
            type="text",
            text=f"Fehler: Abhängigkeit nicht installiert: {e}\n"
                 f"Bitte ausführen: pip install browser-use langchain-ollama"
        )]

    _log(f"Starte Browser-Aufgabe: {task}")

    # Ollama-Modell für Browser Use konfigurieren
    llm = ChatOllama(
        model=MODEL,
        base_url=OLLAMA_BASE_URL,
        temperature=0,
        num_predict=4096,
    )

    # Browser sichtbar starten (für Live-Ansicht)
    browser_config = BrowserConfig(
        headless=False,
        disable_security=False,
    )
    browser = Browser(config=browser_config)

    contents: list[mcp_types.TextContent | mcp_types.ImageContent] = []

    try:
        agent = Agent(
            task=task,
            llm=llm,
            browser=browser,
        )

        # Aufgabe ausführen (max. 25 Schritte)
        history = await agent.run(max_steps=25)

        # Ergebnis extrahieren
        final_result: str = ""
        if hasattr(history, "final_result") and callable(history.final_result):
            final_result = history.final_result() or ""
        elif hasattr(history, "result"):
            final_result = str(history.result)
        else:
            final_result = str(history)

        contents.append(mcp_types.TextContent(
            type="text",
            text=f"Aufgabe abgeschlossen.\n\nErgebnis:\n{final_result}" if final_result
            else "Aufgabe ausgeführt (kein explizites Ergebnis zurückgegeben)."
        ))

        # Abschließenden Screenshot aufnehmen
        screenshot_b64 = await _capture_screenshot_from_browser(browser)
        if screenshot_b64:
            contents.append(mcp_types.ImageContent(
                type="image",
                data=screenshot_b64,
                mimeType="image/png"
            ))

    except Exception as e:
        _log(f"Fehler bei Browser-Aufgabe: {e}")
        contents.append(mcp_types.TextContent(
            type="text",
            text=f"Fehler bei der Ausführung: {type(e).__name__}: {e}"
        ))
    finally:
        try:
            await browser.close()
            _log("Browser geschlossen.")
        except Exception as e:
            _log(f"Warnung beim Schließen des Browsers: {e}")

    return contents


async def _take_standalone_screenshot() -> list[mcp_types.TextContent | mcp_types.ImageContent]:
    """
    Nimmt einen Screenshot auf, ohne eine neue Aufgabe zu starten.
    Nur sinnvoll wenn bereits ein Browser-Kontext existiert (Erweiterung für M3).
    """
    return [mcp_types.TextContent(
        type="text",
        text="Kein aktiver Browser-Kontext. Bitte zuerst 'browser_run_task' aufrufen."
    )]


async def _capture_screenshot_from_browser(browser: Any) -> str | None:
    """Nimmt einen Screenshot aus dem Browser-Objekt auf und gibt base64-PNG zurück."""
    try:
        # Aktuelle Seite über die Playwright-Contexts ermitteln
        if not hasattr(browser, "playwright_browser") or browser.playwright_browser is None:
            return None

        contexts = browser.playwright_browser.contexts
        if not contexts:
            return None

        pages = contexts[-1].pages
        if not pages:
            return None

        page = pages[-1]
        screenshot_bytes = await page.screenshot(full_page=False)
        return base64.b64encode(screenshot_bytes).decode("utf-8")

    except Exception as e:
        _log(f"Screenshot-Fehler: {e}")
        return None


async def main() -> None:
    """Startet den MCP-Server auf stdio."""
    _log(f"Browser Use MCP Server startet. Modell: {MODEL}, Ollama: {OLLAMA_BASE_URL}")
    async with stdio_server() as (read_stream, write_stream):
        await server.run(
            read_stream,
            write_stream,
            server.create_initialization_options()
        )


if __name__ == "__main__":
    asyncio.run(main())
