'use client';

import { useEffect, useState } from 'react';
import { api, formatAmount } from '@/lib/client';
import type {
  Product,
  ProductUpdate,
  Sector,
  SectorWithCategories,
  Paginated,
} from '@/lib/types';
import { ErrorAlert, SuccessAlert, WarnAlert } from '@/components/Alert';
import ConfirmDialog from '@/components/ConfirmDialog';

export default function ProductenPage() {
  const [tab, setTab] = useState<'producten' | 'sectoren'>('producten');
  const [error, setError] = useState<unknown>(null);
  const [success, setSuccess] = useState<string | null>(null);

  return (
    <>
      <div className="page-header">
        <div>
          <h2>Producten & sectoren</h2>
          <p>
            Pas producten aan (naam, prijs, BTW, kleur, zichtbaarheid) of
            bekijk de sectorstructuur met categorieën en producten.
          </p>
        </div>
      </div>

      <ErrorAlert error={error} />
      {success && <SuccessAlert>{success}</SuccessAlert>}

      <div className="pill-toolbar">
        <button
          className={tab === 'producten' ? 'active' : ''}
          onClick={() => setTab('producten')}
        >
          Producten
        </button>
        <button
          className={tab === 'sectoren' ? 'active' : ''}
          onClick={() => setTab('sectoren')}
        >
          Sectoren
        </button>
      </div>

      {tab === 'producten' && (
        <ProductTab setError={setError} setSuccess={setSuccess} />
      )}
      {tab === 'sectoren' && <SectorTab setError={setError} />}
    </>
  );
}

function ProductTab({
  setError,
  setSuccess,
}: {
  setError: (e: unknown) => void;
  setSuccess: (s: string | null) => void;
}) {
  const [products, setProducts] = useState<Product[]>([]);
  const [filter, setFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.get<Product[] | { data: Product[] }>('/products');
      setProducts(Array.isArray(res) ? res : 'data' in res ? res.data : []);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  const filtered = products.filter((p) => {
    if (!filter) return true;
    const f = filter.toLowerCase();
    return (
      (p.product_name_internal ?? '').toLowerCase().includes(f) ||
      (p.product_name_external ?? '').toLowerCase().includes(f) ||
      String(p.product_id).includes(f)
    );
  });

  return (
    <>
      <div className="toolbar">
        <input
          type="search"
          placeholder="Zoek op naam of ID…"
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ maxWidth: 280 }}
        />
        <button className="btn btn-secondary btn-sm" onClick={load}>
          {loading ? <span className="loading" /> : 'Verversen'}
        </button>
        <span className="muted">
          {filtered.length} van {products.length} producten
        </span>
      </div>

      <div className="card">
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Naam (intern)</th>
                <th>Naam (extern)</th>
                <th className="cell-num">Prijs</th>
                <th className="cell-num">BTW</th>
                <th>Kleur</th>
                <th>Zichtbaar</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.product_id}>
                  <td className="mono">{p.product_id}</td>
                  <td>{p.product_name_internal ?? '—'}</td>
                  <td>{p.product_name_external ?? '—'}</td>
                  <td className="cell-num">{formatAmount(p.product_price)}</td>
                  <td className="cell-num">
                    {p.product_vat != null
                      ? `${p.product_vat}%${p.vat?.label ? ' ' + p.vat.label : ''}`
                      : '—'}
                  </td>
                  <td>
                    {p.product_color && (
                      <span
                        style={{
                          display: 'inline-block',
                          width: 18,
                          height: 18,
                          background: p.product_color,
                          border: '1px solid #ccc',
                          borderRadius: 4,
                          verticalAlign: 'middle',
                          marginRight: 6,
                        }}
                      />
                    )}
                    <span className="mono">{p.product_color ?? '—'}</span>
                  </td>
                  <td>
                    {p.product_visible ? (
                      <span className="badge badge-success">ja</span>
                    ) : (
                      <span className="badge badge-warn">nee</span>
                    )}
                  </td>
                  <td>
                    <button
                      className="btn btn-ghost btn-sm"
                      onClick={() => setEditing(p)}
                    >
                      Bewerken
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {filtered.length === 0 && !loading && (
          <div className="empty">Geen producten gevonden.</div>
        )}
      </div>

      {editing && (
        <ProductEditModal
          product={editing}
          onClose={() => setEditing(null)}
          onSaved={(updated) => {
            setProducts((prev) =>
              prev.map((p) =>
                p.product_id === updated.product_id ? { ...p, ...updated } : p,
              ),
            );
            setEditing(null);
            setSuccess(`Product #${updated.product_id} opgeslagen.`);
          }}
          onError={setError}
        />
      )}
    </>
  );
}

function ProductEditModal({
  product,
  onClose,
  onSaved,
  onError,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (p: Product) => void;
  onError: (e: unknown) => void;
}) {
  const [nameInternal, setNameInternal] = useState(
    product.product_name_internal ?? '',
  );
  const [nameExternal, setNameExternal] = useState(
    product.product_name_external ?? '',
  );
  const [price, setPrice] = useState(
    product.product_price != null ? String(product.product_price) : '',
  );
  const [vat, setVat] = useState(
    product.product_vat != null ? String(product.product_vat) : '',
  );
  const [color, setColor] = useState(product.product_color ?? '#ffffff');
  const [description, setDescription] = useState(
    product.product_description ?? '',
  );
  const [visible, setVisible] = useState(product.product_visible ?? true);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const save = async () => {
    setConfirmOpen(false);
    setSaving(true);
    try {
      const body: ProductUpdate = {};
      if (nameInternal !== (product.product_name_internal ?? ''))
        body.product_name_internal = nameInternal;
      if (nameExternal !== (product.product_name_external ?? ''))
        body.product_name_external = nameExternal;
      if (
        price !==
        (product.product_price != null ? String(product.product_price) : '')
      )
        body.product_price = parseFloat(price);
      if (vat !== (product.product_vat != null ? String(product.product_vat) : ''))
        body.product_vat = parseFloat(vat);
      if (color !== (product.product_color ?? '')) body.product_color = color;
      if (description !== (product.product_description ?? ''))
        body.product_description = description;
      if (visible !== (product.product_visible ?? true))
        body.product_visible = visible;
      if (Object.keys(body).length === 0) {
        onClose();
        return;
      }
      await api.put<unknown>(`/products/${product.product_id}`, body);
      const updated: Product = {
        ...product,
        product_name_internal: nameInternal,
        product_name_external: nameExternal,
        product_price: parseFloat(price),
        product_vat: parseFloat(vat),
        product_color: color,
        product_description: description,
        product_visible: visible,
      };
      onSaved(updated);
    } catch (e) {
      onError(e);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        style={{ maxWidth: 620 }}
        onClick={(e) => e.stopPropagation()}
      >
        <h3>Product #{product.product_id} bewerken</h3>
        <WarnAlert>
          Wijzigingen worden direct doorgevoerd in EventPay. Alle kassa's zien
          de nieuwe prijs/kleur na de eerstvolgende sync.
        </WarnAlert>
        <div className="grid grid-2">
          <div className="field">
            <label>Naam intern</label>
            <input
              type="text"
              value={nameInternal}
              onChange={(e) => setNameInternal(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Naam extern (klant ziet dit)</label>
            <input
              type="text"
              value={nameExternal}
              onChange={(e) => setNameExternal(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Prijs (€)</label>
            <input
              type="number"
              step="0.01"
              value={price}
              onChange={(e) => setPrice(e.target.value)}
            />
          </div>
          <div className="field">
            <label>BTW (%)</label>
            <input
              type="number"
              step="0.01"
              value={vat}
              onChange={(e) => setVat(e.target.value)}
            />
          </div>
          <div className="field">
            <label>Kleur</label>
            <div style={{ display: 'flex', gap: 6 }}>
              <input
                type="color"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                style={{ width: 50, padding: 0 }}
              />
              <input
                type="text"
                value={color}
                onChange={(e) => setColor(e.target.value)}
                className="mono"
              />
            </div>
          </div>
          <div className="field" style={{ alignSelf: 'flex-end' }}>
            <label>
              <input
                type="checkbox"
                checked={visible}
                onChange={(e) => setVisible(e.target.checked)}
              />
              Zichtbaar in app
            </label>
          </div>
          <div className="field" style={{ gridColumn: '1 / -1' }}>
            <label>Beschrijving</label>
            <textarea
              rows={3}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
        </div>
        <div className="modal-actions">
          <button className="btn btn-secondary" onClick={onClose}>
            Annuleren
          </button>
          <button
            className="btn"
            onClick={() => setConfirmOpen(true)}
            disabled={saving}
          >
            {saving ? <span className="loading" /> : 'Opslaan'}
          </button>
        </div>
        <ConfirmDialog
          open={confirmOpen}
          title="Product opslaan?"
          message={
            <>
              Wijzigingen voor product <strong>{nameInternal}</strong> (#
              {product.product_id}) worden direct doorgevoerd in productie.
              Doorgaan?
            </>
          }
          danger
          onConfirm={save}
          onCancel={() => setConfirmOpen(false)}
        />
      </div>
    </div>
  );
}

function SectorTab({ setError }: { setError: (e: unknown) => void }) {
  const [sectors, setSectors] = useState<Sector[]>([]);
  const [tree, setTree] = useState<Paginated<SectorWithCategories> | null>(null);
  const [page, setPage] = useState(1);
  const [loadingTree, setLoadingTree] = useState(false);

  const loadFlat = async () => {
    setError(null);
    try {
      const res = await api.get<Sector[] | { data: Sector[] }>('/sectors');
      setSectors(Array.isArray(res) ? res : 'data' in res ? res.data : []);
    } catch (e) {
      setError(e);
    }
  };

  const loadTree = async () => {
    setLoadingTree(true);
    setError(null);
    try {
      const res = await api.get<Paginated<SectorWithCategories>>(
        '/sectors/list',
        { page, limit: 15 },
      );
      setTree(res);
    } catch (e) {
      setError(e);
    } finally {
      setLoadingTree(false);
    }
  };

  useEffect(() => {
    loadFlat();
  }, []);

  return (
    <>
      <div className="card">
        <h3>Alle sectoren ({sectors.length})</h3>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>ID</th>
                <th>Naam</th>
                <th>Actief</th>
                <th>In app</th>
                <th>Stock-locatie</th>
                <th>Mode</th>
                <th>Comment</th>
              </tr>
            </thead>
            <tbody>
              {sectors.map((s) => (
                <tr key={s.sector_id}>
                  <td className="mono">{s.sector_id}</td>
                  <td>{s.sector_name}</td>
                  <td>{s.sector_active ? 'ja' : 'nee'}</td>
                  <td>{s.sector_in_app ? 'ja' : 'nee'}</td>
                  <td>{s.is_stock_location ? 'ja' : 'nee'}</td>
                  <td>{s.sector_mode_id ?? '—'}</td>
                  <td>{s.sector_comment ?? ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3>Sectoren met categorieën en producten</h3>
        <div className="toolbar">
          <div className="field" style={{ width: 100 }}>
            <label>Pagina</label>
            <input
              type="number"
              min={1}
              value={page}
              onChange={(e) => setPage(parseInt(e.target.value) || 1)}
            />
          </div>
          <button
            className="btn"
            onClick={loadTree}
            disabled={loadingTree}
            style={{ alignSelf: 'flex-end' }}
          >
            {loadingTree ? <span className="loading" /> : 'Boom ophalen'}
          </button>
        </div>
        {tree && (
          <>
            <div
              className="muted"
              style={{ fontSize: '0.85rem', marginBottom: 8 }}
            >
              Pagina {tree.meta?.current_page} / {tree.meta?.last_page} —{' '}
              {tree.meta?.total} sectoren
            </div>
            {tree.data.map((s) => (
              <details key={s.sector_id} style={{ marginBottom: 10 }}>
                <summary>
                  <strong>{s.sector_name}</strong>{' '}
                  <span className="muted">
                    (ID {s.sector_id}, {s.categories?.length ?? 0} categorieën)
                  </span>
                </summary>
                {s.categories?.map((c) => (
                  <details
                    key={c.categorie_id}
                    style={{ marginLeft: 18, marginTop: 6 }}
                  >
                    <summary>
                      <span
                        style={{
                          display: 'inline-block',
                          width: 10,
                          height: 10,
                          background: c.categorie_color ?? '#ccc',
                          borderRadius: 2,
                          marginRight: 6,
                          verticalAlign: 'middle',
                        }}
                      />
                      {c.categorie_name}{' '}
                      <span className="muted">
                        ({c.products?.length ?? 0} producten)
                      </span>
                    </summary>
                    {c.products && c.products.length > 0 && (
                      <ul style={{ margin: '6px 0 6px 18px' }}>
                        {c.products.map((p) => (
                          <li key={p.product_id}>
                            #{p.product_id} —{' '}
                            {p.product_name_internal ?? p.product_name_external}{' '}
                            — {formatAmount(p.product_price)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </details>
                ))}
              </details>
            ))}
          </>
        )}
      </div>
    </>
  );
}
