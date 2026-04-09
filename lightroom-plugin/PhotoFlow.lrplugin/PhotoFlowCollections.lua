--[[
  PhotoFlow - Smart Collections Manager
  Erstellt automatisch Collections für:
  - Neue Bilder (noch nicht bearbeitet)
  - Zu bearbeiten
  - Bearbeitet
  - Alle Kategorien (Tiere/Fuchs, Landschaft etc.)
]]

local LrApplication = import 'LrApplication'
local LrCatalog = import 'LrCatalog'

-- Hauptfunktion: Alle Collections sicherstellen
function _G.PhotoFlow_EnsureCollections(catalog)
  catalog:withWriteAccessDo('PhotoFlow Collections', function()
    local rootSets = catalog:getRootCollectionSets()
    
    -- PhotoFlow Collection Set finden oder erstellen
    local pfSet = nil
    for _, set in ipairs(rootSets) do
      if set:getName() == 'PhotoFlow' then
        pfSet = set
        break
      end
    end
    
    if not pfSet then
      pfSet = catalog:createCollectionSet('PhotoFlow', nil, true)
    end
    
    -- ─── 1. Status-Collections ────────────────────────────────────────
    local statusSet = _getOrCreateSet(catalog, 'Status', pfSet)
    
    -- Neue Bilder (importiert in letzten 30 Tagen, Bewertung = 0)
    _createSmartCollection(catalog, '⭐ Neue Bilder', statusSet, {
      combine = 'intersect',
      rules = {
        { criteria = 'captureTime', operation = 'inLast', value = '30', value2 = 'days' },
        { criteria = 'rating', operation = '=', value = 0 }
      }
    })
    
    -- Noch zu bearbeiten (Bewertung 1-2 Sterne)
    _createSmartCollection(catalog, '🔧 Noch zu bearbeiten', statusSet, {
      combine = 'intersect',
      rules = {
        { criteria = 'rating', operation = '>=', value = 1 },
        { criteria = 'rating', operation = '<=', value = 2 },
      }
    })
    
    -- Bearbeitet (3+ Sterne)
    _createSmartCollection(catalog, '✅ Bearbeitet', statusSet, {
      combine = 'intersect',
      rules = {
        { criteria = 'rating', operation = '>=', value = 3 }
      }
    })
    
    -- Alle Favoriten (5 Sterne)
    _createSmartCollection(catalog, '💎 Favoriten (5★)', statusSet, {
      combine = 'intersect',
      rules = {
        { criteria = 'rating', operation = '=', value = 5 }
      }
    })
    
    -- ─── 2. Kategorie-Collections ─────────────────────────────────────
    local catSet = _getOrCreateSet(catalog, 'Kategorien', pfSet)
    
    local categories = {
      -- Tiere
      { set = 'Tiere', name = '🦊 Fuchs',     keyword = 'Fuchs' },
      { set = 'Tiere', name = '🐕 Hund',      keyword = 'Hund' },
      { set = 'Tiere', name = '🐈 Katze',     keyword = 'Katze' },
      { set = 'Tiere', name = '🦅 Vogel',     keyword = 'Vogel' },
      { set = 'Tiere', name = '🦌 Reh',       keyword = 'Reh' },
      { set = 'Tiere', name = '🐗 Wildschwein', keyword = 'Wildschwein' },
      -- Landschaft
      { set = 'Landschaft', name = '🏔️ Berge',     keyword = 'Berge' },
      { set = 'Landschaft', name = '🌲 Wald',      keyword = 'Wald' },
      { set = 'Landschaft', name = '💧 Gewässer',  keyword = 'See' },
      { set = 'Landschaft', name = '🌅 Sonnenuntergang', keyword = 'Sonnenuntergang' },
      { set = 'Landschaft', name = '⛰️ Sächsische Schweiz', keyword = 'Sächsische Schweiz' },
      -- Andere
      { set = 'Architektur', name = '🏙️ Stadt',    keyword = 'Stadt' },
      { set = 'Menschen',    name = '👤 Portrait',  keyword = 'Portrait' },
      { set = 'Pflanzen',    name = '🌸 Blumen',   keyword = 'Blume' },
    }
    
    -- Sub-Sets für Kategorien
    local subSets = {}
    for _, cat in ipairs(categories) do
      if not subSets[cat.set] then
        subSets[cat.set] = _getOrCreateSet(catalog, cat.set, catSet)
      end
      _createSmartCollection(catalog, cat.name, subSets[cat.set], {
        combine = 'intersect',
        rules = {
          { criteria = 'keywords', operation = 'containsWords', value = cat.keyword }
        }
      })
    end
    
    -- ─── 3. Datum-Collections (letzte Monate) ─────────────────────────
    local dateSet = _getOrCreateSet(catalog, 'Zeitraum', pfSet)
    
    local months = {
      { name = '📅 Diese Woche',   days = 7 },
      { name = '📅 Diesen Monat',  days = 30 },
      { name = '📅 Letztes Quartal', days = 90 },
    }
    
    for _, m in ipairs(months) do
      _createSmartCollection(catalog, m.name, dateSet, {
        combine = 'intersect',
        rules = {
          { criteria = 'captureTime', operation = 'inLast', value = tostring(m.days), value2 = 'days' }
        }
      })
    end
  end)
end

-- Hilfsfunktionen
function _getOrCreateSet(catalog, name, parent)
  if parent then
    local children = parent:getChildCollectionSets()
    for _, child in ipairs(children) do
      if child:getName() == name then return child end
    end
    return catalog:createCollectionSet(name, parent, true)
  else
    local roots = catalog:getRootCollectionSets()
    for _, s in ipairs(roots) do
      if s:getName() == name then return s end
    end
    return catalog:createCollectionSet(name, nil, true)
  end
end

function _createSmartCollection(catalog, name, parent, searchDesc)
  -- Bereits vorhanden?
  if parent then
    local children = parent:getChildCollections()
    for _, col in ipairs(children) do
      if col:getName() == name then return col end
    end
  end
  return catalog:createSmartCollection(name, searchDesc, parent, true)
end
