import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { TextStyle } from '@tiptap/extension-text-style';
import { Color } from '@tiptap/extension-color';
import { useEffect } from 'react';

import { sanitizeHtml } from '@/blocks/sanitize';

/**
 * Rich-text editor (Tiptap) for `richtext` fields (paragraph, accordion).
 *
 * StarterKit v3 already bundles bold/italic/underline/link/lists, so we only
 * add TextStyle + Color for per-run text color. Output is sanitized before it
 * leaves the component, and again on render — defense in depth against XSS.
 */
export function RichTextEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ link: { openOnClick: false, autolink: true } }),
      TextStyle,
      Color,
    ],
    content: value,
    onUpdate: ({ editor }) => onChange(sanitizeHtml(editor.getHTML())),
    editorProps: {
      attributes: {
        class:
          'min-h-24 rounded-md border border-gray-300 px-3 py-2 focus:outline-none focus-visible:ring-2 [&_ul]:list-disc [&_ol]:list-decimal [&_ul]:pl-6 [&_ol]:pl-6 [&_a]:underline',
      },
    },
  });

  // Keep editor content in sync if the value changes from outside (e.g. switching blocks).
  useEffect(() => {
    if (editor && value !== editor.getHTML()) {
      editor.commands.setContent(value, { emitUpdate: false });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, editor]);

  if (!editor) return null;

  const btn = (active: boolean) =>
    `rounded px-2 py-1 text-sm ${active ? 'bg-black/15 font-semibold' : 'hover:bg-black/10'}`;

  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap items-center gap-1 rounded-md bg-black/5 p-1">
        <button type="button" className={btn(editor.isActive('bold'))} onClick={() => editor.chain().focus().toggleBold().run()} aria-label="Bold"><b>B</b></button>
        <button type="button" className={btn(editor.isActive('italic'))} onClick={() => editor.chain().focus().toggleItalic().run()} aria-label="Italic"><i>I</i></button>
        <button type="button" className={btn(editor.isActive('underline'))} onClick={() => editor.chain().focus().toggleUnderline().run()} aria-label="Underline"><u>U</u></button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button type="button" className={btn(editor.isActive('bulletList'))} onClick={() => editor.chain().focus().toggleBulletList().run()} aria-label="Bullet list">• List</button>
        <button type="button" className={btn(editor.isActive('orderedList'))} onClick={() => editor.chain().focus().toggleOrderedList().run()} aria-label="Numbered list">1. List</button>
        <span className="mx-1 h-4 w-px bg-black/20" />
        <button
          type="button"
          className={btn(editor.isActive('link'))}
          onClick={() => {
            const url = window.prompt('Link URL (leave empty to remove):', editor.getAttributes('link').href ?? '');
            if (url === null) return;
            if (url === '') editor.chain().focus().unsetLink().run();
            else editor.chain().focus().setLink({ href: url }).run();
          }}
          aria-label="Link"
        >🔗</button>
        <label className="ml-1 flex items-center gap-1 text-sm" title="Text color">
          🎨
          <input
            type="color"
            className="h-6 w-6 cursor-pointer border-0 bg-transparent p-0"
            value={editor.getAttributes('textStyle').color ?? '#000000'}
            onChange={(e) => editor.chain().focus().setColor(e.target.value).run()}
          />
        </label>
        <button type="button" className="rounded px-2 py-1 text-sm hover:bg-black/10" onClick={() => editor.chain().focus().unsetColor().run()}>Reset color</button>
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
