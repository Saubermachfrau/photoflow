--[[
  PhotoFlow Lightroom Classic Plugin
  Automatische Smart Collections für neue und bearbeitete Bilder
  
  Installation: Diesen Ordner in Lightroom → Datei → Plug-in-Manager → Hinzufügen
]]

local LrApplication = import 'LrApplication'
local LrCatalog = import 'LrCatalog'
local LrDialogs = import 'LrDialogs'
local LrFunctionContext = import 'LrFunctionContext'
local LrTasks = import 'LrTasks'
local LrPathUtils = import 'LrPathUtils'
local LrFileUtils = import 'LrFileUtils'

-- Plugin Info
return {
  LrSdkVersion = 6.0,
  LrSdkMinimumVersion = 4.0,
  LrToolkitIdentifier = 'com.photoflow.lightroom',
  LrPluginName = 'PhotoFlow',
  LrPluginInfoUrl = 'https://github.com/photoflow',

  LrInitPlugin = function()
    -- Beim Start: Smart Collections prüfen/anlegen
    LrTasks.startAsyncTask(function()
      LrFunctionContext.callWithContext('photoflow_init', function(context)
        local catalog = LrApplication.activeCatalog()
        if catalog then
          _G.PhotoFlow_EnsureCollections(catalog)
        end
      end)
    end)
  end,

  LrExportMenuItems = {
    {
      title = 'PhotoFlow: Collections aktualisieren',
      func = function()
        LrFunctionContext.callWithContext('photoflow_update', function(context)
          local catalog = LrApplication.activeCatalog()
          _G.PhotoFlow_EnsureCollections(catalog)
          LrDialogs.message('PhotoFlow', 'Smart Collections wurden aktualisiert!', 'info')
        end)
      end
    }
  }
}
