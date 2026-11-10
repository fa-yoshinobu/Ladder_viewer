using System.Text;

namespace LadderViewer;

internal sealed record CommentListEntry(string Address, string Comment);
internal sealed record CommentListRequest(string Title, string SelectedAddress, bool Dark, CommentListEntry[] Entries);

internal sealed class CommentListWindow : Form
{
    private readonly DataGridView grid = new();
    private readonly TextBox search = new() { PlaceholderText = "アドレス・コメントで絞り込み", Width = 300 };
    private readonly Label count = new() { AutoSize = true, Padding = new Padding(6, 8, 0, 0) };
    private readonly ContextMenuStrip menu = new();
    private CommentListEntry[] entries = [], visible = [];

    public CommentListWindow()
    {
        Text = "コメントリスト";
        Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath);
        Font = new Font("Yu Gothic UI", 10F);
        AutoScaleMode = AutoScaleMode.Dpi;
        StartPosition = FormStartPosition.CenterParent;
        ClientSize = new Size(840, 620);
        MinimumSize = new Size(580, 360);
        ShowInTaskbar = false;
        var toolbar = new FlowLayoutPanel { Dock = DockStyle.Top, AutoSize = true, Padding = new Padding(10), WrapContents = true };
        var copy = new Button { Text = "選択範囲をコピー", AutoSize = true };
        var all = new Button { Text = "すべてコピー", AutoSize = true };
        copy.Click += (_, _) => CopyRows();
        all.Click += (_, _) => { grid.SelectAll(); CopyRows(); };
        toolbar.Controls.AddRange([search, copy, all, count]);
        grid.Dock = DockStyle.Fill;
        grid.ReadOnly = true;
        grid.VirtualMode = true;
        grid.AllowUserToAddRows = false;
        grid.AllowUserToDeleteRows = false;
        grid.RowHeadersVisible = false;
        grid.SelectionMode = DataGridViewSelectionMode.FullRowSelect;
        grid.MultiSelect = true;
        grid.ClipboardCopyMode = DataGridViewClipboardCopyMode.EnableWithoutHeaderText;
        grid.AutoSizeColumnsMode = DataGridViewAutoSizeColumnsMode.Fill;
        grid.AutoSizeRowsMode = DataGridViewAutoSizeRowsMode.DisplayedCells;
        grid.DefaultCellStyle.WrapMode = DataGridViewTriState.True;
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "アドレス", FillWeight = 24, MinimumWidth = 130, SortMode = DataGridViewColumnSortMode.NotSortable });
        grid.Columns.Add(new DataGridViewTextBoxColumn { HeaderText = "コメント", FillWeight = 76, SortMode = DataGridViewColumnSortMode.NotSortable });
        grid.CellValueNeeded += (_, e) => { if (e.RowIndex < visible.Length) e.Value = e.ColumnIndex == 0 ? visible[e.RowIndex].Address : visible[e.RowIndex].Comment; };
        grid.KeyDown += (_, e) => { if (e.Control && e.KeyCode == Keys.C) { e.SuppressKeyPress = true; CopyRows(); } };
        menu.Items.Add("コピー", null, (_, _) => CopyRows());
        menu.Items.Add("すべてコピー", null, (_, _) => { grid.SelectAll(); CopyRows(); });
        grid.ContextMenuStrip = menu;
        grid.CellMouseDown += (_, e) => { if (e.Button == MouseButtons.Right && e.RowIndex >= 0 && !grid.Rows[e.RowIndex].Selected) { grid.ClearSelection(); grid.Rows[e.RowIndex].Selected = true; grid.CurrentCell = grid.Rows[e.RowIndex].Cells[0]; } };
        search.TextChanged += (_, _) => Filter();
        var hint = new Label { Dock = DockStyle.Bottom, Height = 30, Padding = new Padding(10, 4, 0, 0), Text = "Shiftで範囲選択・Ctrl+Cでコピー。Excelなどへアドレスとコメントの2列で貼り付けできます。" };
        Controls.Add(grid);
        Controls.Add(hint);
        Controls.Add(toolbar);
        Disposed += (_, _) => menu.Dispose();
    }

    public void SetComments(CommentListRequest request)
    {
        Text = "コメントリスト — " + request.Title;
        var background = request.Dark ? Color.FromArgb(31, 31, 31) : Color.White;
        var foreground = request.Dark ? Color.FromArgb(242, 242, 242) : Color.FromArgb(26, 26, 26);
        BackColor = grid.BackgroundColor = search.BackColor = background;
        ForeColor = search.ForeColor = foreground;
        grid.DefaultCellStyle.BackColor = background;
        grid.DefaultCellStyle.ForeColor = foreground;
        grid.DefaultCellStyle.SelectionBackColor = request.Dark ? Color.FromArgb(31, 58, 92) : Color.FromArgb(209, 226, 251);
        grid.DefaultCellStyle.SelectionForeColor = foreground;
        grid.EnableHeadersVisualStyles = false;
        grid.ColumnHeadersDefaultCellStyle.BackColor = request.Dark ? Color.FromArgb(42, 42, 42) : Color.FromArgb(242, 242, 242);
        grid.ColumnHeadersDefaultCellStyle.ForeColor = foreground;
        entries = request.Entries;
        search.Clear();
        Filter();
        var index = Array.FindIndex(visible, row => row.Address.Equals(request.SelectedAddress, StringComparison.OrdinalIgnoreCase));
        if (index >= 0)
        {
            grid.ClearSelection();
            grid.CurrentCell = grid.Rows[index].Cells[0];
            grid.Rows[index].Selected = true;
            grid.FirstDisplayedScrollingRowIndex = Math.Max(0, index - Math.Max(1, grid.DisplayedRowCount(false)) / 2);
        }
        grid.Focus();
    }

    private void Filter()
    {
        var query = search.Text.Normalize(NormalizationForm.FormKC).Trim();
        visible = query.Length == 0 ? entries : entries.Where(row => row.Address.Normalize(NormalizationForm.FormKC).Contains(query, StringComparison.OrdinalIgnoreCase)
            || row.Comment.Normalize(NormalizationForm.FormKC).Contains(query, StringComparison.OrdinalIgnoreCase)).ToArray();
        grid.RowCount = 0;
        grid.RowCount = visible.Length;
        grid.Invalidate();
        count.Text = $"{visible.Length:N0} / {entries.Length:N0} 件";
    }

    private void CopyRows()
    {
        try { if (grid.GetClipboardContent() is { } data) Clipboard.SetDataObject(data, true); }
        catch (System.Runtime.InteropServices.ExternalException) { MessageBox.Show(this, "クリップボードへコピーできませんでした。もう一度お試しください。", "コメントリスト", MessageBoxButtons.OK, MessageBoxIcon.Warning); }
    }
}
