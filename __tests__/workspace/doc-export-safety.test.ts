// @vitest-environment jsdom
import { describe, expect, it } from 'vitest';
import { sanitizeAgentHtml } from '@/app/api/workspaces/[id]/agent/agentHtmlSanitize';
import { docContentHtml } from '@/app/api/workspaces/[id]/agent/docRichOperations';
import { workspaceDocExportBody, workspaceDocExportHtml } from '@/app/workspace/utils/workspaceDocExportHtml';
import { workspaceDocCanvasHiddenIds, workspaceDocCanvasSvg } from '@/app/workspace/utils/workspaceDocCanvasExport';
import { workspaceTableExportHtml } from '@/app/workspace/utils/workspaceDocTableExport';
import type { CanvasBlock } from '@/app/workspace/types/block';

describe('Document export and supported HTML safety', () => {
  it('preserves schema-owned styles, identities and image originals without unsafe URLs or CSS', () => {
    const html = sanitizeAgentHtml('<p data-line-id="p1" style="line-height:1.5"><span style="color:rgb(1, 2, 3);font-family:Arial;font-size:24px;position:fixed;background-image:url(https://bad)">Text</span><mark data-color="#ffcc00" style="background-color:#ffcc00;color:inherit">mark</mark></p><img src="/image.png" data-download-url="javascript:alert(1)" data-caption="Caption" data-width="50%" data-align="right">', { docAlign: true });
    expect(html).toContain('data-line-id="p1"');
    expect(html).toContain('line-height: 1.5');
    expect(html).toContain('font-size: 24px');
    expect(html).toContain('color: rgb(1, 2, 3)');
    expect(html).toContain('background-color: #ffcc00');
    expect(html).toContain('data-caption="Caption"');
    expect(html).not.toMatch(/javascript|background-image|position:|url\(/);
    expect(sanitizeAgentHtml('<span style="font-family:var(--bad);color:rgb(999,0,0);font-size:calc(2px)">x</span>', { docAlign: true })).toBe('<span>x</span>');
    const generated = new DOMParser().parseFromString(docContentHtml('![a](x"onerror="alert(1)'), 'text/html');
    expect(generated.querySelector('img')).not.toBeNull();
    expect(generated.querySelector('img')?.hasAttribute('onerror')).toBe(false);
  });

  it('creates full, semantic HTML with captions and printable overflowing content', () => {
    const source = '<h2>Heading</h2><img src="/image.png" data-download-url="/original.png" data-caption="&lt;script&gt;caption" data-width="50%"><div data-workspace-table="true" data-table-id="t"></div>';
    const body = workspaceDocExportBody(source, { t: { type: 'table', data: { rows: 1, cols: 2, cells: [['A', 'B']] } } });
    expect(body).toContain('<figcaption>&lt;script&gt;caption</figcaption>');
    expect(body).toContain('href="/original.png"');
    expect(body).toContain('<td>A</td>');
    expect(body).not.toContain('data-workspace-table');
    const file = workspaceDocExportHtml(body, 'A <title>');
    expect(file).toContain('<title>A &lt;title&gt;</title>');
    expect(file).toContain('@page{size:A4');
    expect(file).not.toContain('overflow:hidden');
  });

  it('preserves supported embedded table merged cells, values and cell formatting', () => {
    const html = workspaceTableExportHtml({ rows: 2, cols: 2, cells: [['Merged', 'skip'], ['A', 'B']], merges: [{ row: 0, col: 0, rowSpan: 1, colSpan: 2 }], headerRow: true, cellBgColor: [['#ff0000']], cellFontSizes: [[24]], colWeights: [2, 1] });
    expect(html).toContain('colspan="2"');
    expect(html).toContain('background-color:#ff0000');
    expect(html).toContain('font-size:24px');
    expect(html).toContain('width:66.667%');
    expect(html).not.toContain('skip');
  });

  it('feeds actual formatted Doc markup into the canvas SVG instead of an empty text adapter', async () => {
    const block = { id: 'doc', type: 'doc', data: { html: '<h1>Canvas content</h1><p><strong>Bold</strong></p>' } } as CanvasBlock<'doc'>;
    const svg = await workspaceDocCanvasSvg(block, { doc: block }, 400, 300);
    expect(svg).toContain('<foreignObject');
    expect(svg).toContain('<h1>Canvas content</h1>');
    expect(svg).toContain('<strong>Bold</strong>');
    expect(svg).toContain('height: 300px');
    expect(svg).toContain('overflow: hidden');
  });

  it('renders table cell attachments and chart atoms without editor NodeViews', () => {
    const html = '<div data-workspace-table="true" data-table-id="t"></div><div data-slide-chart="bar" data-series="[{&quot;label&quot;:&quot;October&quot;,&quot;value&quot;:20}]"></div>';
    const blocks = {
      t: { type: 'table', data: { rows: 1, cols: 1, cells: [['Cell']], cellItems: { '0:0': [{ blockId: 'image' }, { blockId: 'text' }] } } },
      image: { type: 'image', data: { url: 'images/cell.png', alt: 'Cell image' } },
      text: { type: 'text', data: { markdown: '**Attachment**' } },
    };
    const body = workspaceDocExportBody(html, blocks);
    expect(body).toContain('src="images/cell.png"');
    expect(body).toContain('<strong>Attachment</strong>');
    expect(body).toContain('October</th>');
    expect(body).toContain('background:#2563eb;width:100%');
    expect(body).not.toContain('data-slide-chart');
  });

  it('avoids duplicate embedded table attachments while allowing an independent table selection', () => {
    const blocks = {
      doc: { id: 'doc', type: 'doc', data: { html: '' } },
      table: { id: 'table', type: 'table', embeddedInDocId: 'doc', data: { cellItems: { '0:0': [{ blockId: 'image' }] } } },
      image: { id: 'image', type: 'image', data: { url: '/image.png' } },
    } as Record<string, CanvasBlock>;
    expect([...workspaceDocCanvasHiddenIds(blocks)]).toEqual(['table', 'image']);
    expect([...workspaceDocCanvasHiddenIds(blocks, ['table'])]).toEqual([]);
  });
});
