import React, { useState, useEffect, useCallback } from 'react';
import { Loader2, Cast, RotateCcw, Tv, Crown, Lock } from 'lucide-react';
import DashboardTile from './DashboardTile';
import DeleteConfirmationModal from './DeleteConfirmationModal';
import WarningModal from './WarningModal';
import GhostTile from './GhostTile';
import TileSelectionModal from './TileSelectionModal';
import CastingModal from './CastingModal';
import UpgradeModal from './UpgradeModal';
import FeatureLockIndicator from './FeatureLockIndicator';
import { TileData } from '../types/dashboard';
import { useLayoutPersistence } from '../hooks/useLayoutPersistence';
import { useSubscription } from '../contexts/SubscriptionContext';
import { getDefaultTilesForView } from '../data/mockData';

interface DashboardGridProps {
  view: string;
  sidebarCollapsed: boolean;
}

interface TileTemplate {
  id: string;
  title: string;
  description: string;
  type: 'metric' | 'chart' | 'api' | 'interactive';
  color: string;
  category: string;
  preview: {
    value: string;
    change?: number;
    changeType?: 'increase' | 'decrease';
  };
}

const DashboardGrid: React.FC<DashboardGridProps> = ({ view, sidebarCollapsed }) => {
  const { saveLayout, loadLayout, resetLayout, resetAllCastTiles, isLoading } = useLayoutPersistence();
  const { subscription, canUseFeature, isFeatureLocked } = useSubscription();
  
  const [tiles, setTiles] = useState<TileData[]>([]);
  const [tileToDelete, setTileToDelete] = useState<string | null>(null);
  const [deletingTile, setDeletingTile] = useState<string | null>(null);
  const [castTiles, setCastTiles] = useState<Set<string>>(new Set());
  const [castTileData, setCastTileData] = useState<{ [key: string]: TileData }>({});
  const [isResetting, setIsResetting] = useState(false);
  
  // Android-style drag and drop states
  const [draggedTile, setDraggedTile] = useState<string | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [hoverIndex, setHoverIndex] = useState<number | null>(null);
  const [dragOffset, setDragOffset] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  
  // Warning modal states
  const [showClearAllWarning, setShowClearAllWarning] = useState(false);
  
  // Tile addition states
  const [showTileSelection, setShowTileSelection] = useState(false);

  // Casting states
  const [showCastingModal, setShowCastingModal] = useState(false);
  
  // Subscription states
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [lockedFeature, setLockedFeature] = useState<string>('');

  // Check if tile is in the bottom 4 tiles (last 4 in the array)
  const isTileNonDraggable = useCallback((index: number, totalTiles: number) => {
    return index >= totalTiles - 4;
  }, []);

  // Check subscription limits
  const checkTileLimit = useCallback(() => {
    const maxTiles = subscription.features.maxTiles;
    return tiles.length >= maxTiles;
  }, [tiles.length, subscription.features.maxTiles]);

  const canAddMoreTiles = useCallback(() => {
    return !checkTileLimit();
  }, [checkTileLimit]);

  // Load saved layout or use defaults
  useEffect(() => {
    if (isLoading) return;

    const saved = loadLayout(view);
    
    // Load global cast tiles data with safety check
    setCastTiles(new Set(Array.isArray(saved.castTiles) ? saved.castTiles : []));
    setCastTileData(saved.castTileData || {});
    
    let tilesToShow: TileData[] = [];
    
    if (view === 'ai-tools') {
      // For Stacc Cast view, show all cast tiles
      const safeCastTiles = Array.isArray(saved.castTiles) ? saved.castTiles : [];
      const safeCastTileData = saved.castTileData || {};
      tilesToShow = safeCastTiles.map(tileId => safeCastTileData[tileId]).filter(Boolean);
    } else {
      // For other views, show default tiles (respecting subscription limits)
      const defaultTiles = getDefaultTilesForView(view);
      const maxTiles = subscription.features.maxTiles;
      tilesToShow = defaultTiles.slice(0, maxTiles);
    }
    
    setTiles(tilesToShow);
  }, [view, loadLayout, isLoading, subscription.features.maxTiles]);

  // Enhanced drag and drop handlers with Android-style behavior
  const handleDragStart = useCallback((e: React.DragEvent, tileId: string) => {
    const index = tiles.findIndex(tile => tile.id === tileId);
    
    // Prevent dragging for bottom 4 tiles
    if (isTileNonDraggable(index, tiles.length)) {
      e.preventDefault();
      return;
    }
    
    setDraggedTile(tileId);
    setDraggedIndex(index);
    setIsDragging(true);
    
    // Get the drag image offset
    const rect = (e.target as HTMLElement).getBoundingClientRect();
    setDragOffset({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    });
    
    // Make drag image slightly transparent
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', tileId);
    
    // Create a custom drag image
    const dragImage = (e.target as HTMLElement).cloneNode(true) as HTMLElement;
    dragImage.style.transform = 'rotate(2deg) scale(0.95)';
    dragImage.style.opacity = '0.8';
    document.body.appendChild(dragImage);
    e.dataTransfer.setDragImage(dragImage, dragOffset.x, dragOffset.y);
    setTimeout(() => document.body.removeChild(dragImage), 0);
  }, [tiles, dragOffset.x, dragOffset.y, isTileNonDraggable]);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    
    if (draggedIndex === null || draggedIndex === index) return;
    
    // Prevent dropping on bottom 4 tiles
    if (isTileNonDraggable(index, tiles.length)) {
      e.dataTransfer.dropEffect = 'none';
      return;
    }
    
    setHoverIndex(index);
  }, [draggedIndex, tiles.length, isTileNonDraggable]);

  const handleDragEnter = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === index) return;
    
    // Prevent dropping on bottom 4 tiles
    if (isTileNonDraggable(index, tiles.length)) {
      return;
    }
    
    // Real-time tile shifting - create preview of new order
    const newTiles = [...tiles];
    const [draggedTileData] = newTiles.splice(draggedIndex, 1);
    newTiles.splice(index, 0, draggedTileData);
    
    // Update the visual order immediately
    setTiles(newTiles);
    setDraggedIndex(index);
    setHoverIndex(index);
  }, [draggedIndex, tiles, isTileNonDraggable]);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    // Only clear hover if leaving the entire grid area
    const relatedTarget = e.relatedTarget as HTMLElement;
    if (!relatedTarget || !relatedTarget.closest('[data-grid-container]')) {
      setHoverIndex(null);
    }
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    
    if (!draggedTile || draggedIndex === null) return;

    // Prevent dropping on bottom 4 tiles
    if (isTileNonDraggable(targetIndex, tiles.length)) {
      return;
    }

    // The tiles have already been reordered in real-time during drag
    // Just need to save the final state
    const finalTiles = [...tiles];
    
    // Save the new order
    if (view === 'ai-tools') {
      // For Stacc Cast, update cast tile data
      const newCastTileData = { ...castTileData };
      const newCastTileIds = finalTiles.map(t => t.id);
      setCastTiles(new Set(newCastTileIds));
      saveLayout(view, [], finalTiles, undefined, newCastTileIds, newCastTileData);
    } else {
      // For other views, just save the tile order
      saveLayout(view, [], finalTiles, undefined, Array.from(castTiles), castTileData);
    }

    // Clean up drag states
    setDraggedTile(null);
    setDraggedIndex(null);
    setHoverIndex(null);
    setIsDragging(false);
  }, [draggedTile, draggedIndex, tiles, view, castTileData, castTiles, saveLayout, isTileNonDraggable]);

  const handleDragEnd = useCallback(() => {
    // Clean up drag states
    setDraggedTile(null);
    setDraggedIndex(null);
    setHoverIndex(null);
    setIsDragging(false);
  }, []);

  const handleTileUpdate = useCallback((updatedTile: TileData) => {
    setTiles(prev => prev.map(tile => 
      tile.id === updatedTile.id ? updatedTile : tile
    ));
    
    // Update cast tile data if this tile is cast
    if (castTiles.has(updatedTile.id)) {
      const newCastTileData = { ...castTileData, [updatedTile.id]: updatedTile };
      setCastTileData(newCastTileData);
      saveLayout(view, [], tiles, undefined, Array.from(castTiles), newCastTileData);
    }
  }, [castTiles, castTileData, view, tiles, saveLayout]);

  const handleDeleteTile = useCallback((tileId: string) => {
    setTileToDelete(tileId);
  }, []);

  const handleCastTile = useCallback((tileId: string) => {
    const tileToToggle = tiles.find(t => t.id === tileId);
    if (!tileToToggle) return;

    setCastTiles(prev => {
      const newCastTiles = new Set(prev);
      let newCastTileData = { ...castTileData };
      
      if (newCastTiles.has(tileId)) {
        // Remove from cast
        newCastTiles.delete(tileId);
        delete newCastTileData[tileId];
      } else {
        // Add to cast
        newCastTiles.add(tileId);
        newCastTileData[tileId] = tileToToggle;
      }
      
      setCastTileData(newCastTileData);
      
      // Save the global cast state
      saveLayout(view, [], tiles, undefined, Array.from(newCastTiles), newCastTileData);
      
      return newCastTiles;
    });
  }, [tiles, castTileData, view, saveLayout]);

  const confirmDeleteTile = useCallback(() => {
    if (!tileToDelete) return;

    setDeletingTile(tileToDelete);
    
    setTimeout(() => {
      setTiles(prev => {
        const newTiles = prev.filter(tile => tile.id !== tileToDelete);
        
        // Remove from cast tiles if it was cast
        const newCastTiles = new Set(castTiles);
        newCastTiles.delete(tileToDelete);
        setCastTiles(newCastTiles);
        
        const newCastTileData = { ...castTileData };
        delete newCastTileData[tileToDelete];
        setCastTileData(newCastTileData);
        
        saveLayout(view, [], newTiles, undefined, Array.from(newCastTiles), newCastTileData);
        
        return newTiles;
      });
      setDeletingTile(null);
      setTileToDelete(null);
    }, 300);
  }, [tileToDelete, view, saveLayout, castTiles, castTileData]);

  const cancelDeleteTile = useCallback(() => {
    setTileToDelete(null);
  }, []);

  const handleResetLayoutClick = useCallback(() => {
    if (view === 'ai-tools' && castTiles.size > 0) {
      // Show warning for Stacc Cast clear all
      setShowClearAllWarning(true);
    } else {
      // Direct reset for other views or empty Stacc Cast
      performResetLayout();
    }
  }, [view, castTiles.size]);

  const performResetLayout = useCallback(async () => {
    setIsResetting(true);
    
    await new Promise(resolve => setTimeout(resolve, 500));
    
    if (view === 'ai-tools') {
      // For Stacc Cast, reset all cast tiles
      resetAllCastTiles();
      setCastTiles(new Set());
      setCastTileData({});
      setTiles([]);
    } else {
      // For other views, reset layout
      resetLayout(view);
      const defaultTiles = getDefaultTilesForView(view);
      const maxTiles = subscription.features.maxTiles;
      setTiles(defaultTiles.slice(0, maxTiles));
    }
    
    setIsResetting(false);
    setShowClearAllWarning(false);
  }, [view, resetLayout, resetAllCastTiles, subscription.features.maxTiles]);

  const cancelClearAll = useCallback(() => {
    setShowClearAllWarning(false);
  }, []);

  // Handle adding new tiles (with subscription check)
  const handleAddTile = useCallback(() => {
    if (!canAddMoreTiles()) {
      setLockedFeature('Unlimited Tiles');
      setShowUpgradeModal(true);
      return;
    }
    setShowTileSelection(true);
  }, [canAddMoreTiles]);

  const handleSelectTile = useCallback((template: TileTemplate) => {
    if (!canAddMoreTiles()) {
      setLockedFeature('Unlimited Tiles');
      setShowUpgradeModal(true);
      return;
    }

    const newTile: TileData = {
      id: `custom-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      title: template.title,
      description: template.description,
      value: template.preview.value,
      change: template.preview.change,
      changeType: template.preview.changeType,
      chart: template.type === 'chart' ? [45, 52, 48, 61, 58, 67, 73, 69] : undefined,
      type: template.type,
      color: template.color,
      category: template.category,
      lastUpdated: new Date().toLocaleString()
    };

    // Add the new tile to the current view
    const newTiles = [...tiles, newTile];
    setTiles(newTiles);
    
    // Save the updated layout
    if (view === 'ai-tools') {
      // If adding to Stacc Cast, also add to cast tiles
      const newCastTiles = new Set([...castTiles, newTile.id]);
      const newCastTileData = { ...castTileData, [newTile.id]: newTile };
      setCastTiles(newCastTiles);
      setCastTileData(newCastTileData);
      saveLayout(view, [], newTiles, undefined, Array.from(newCastTiles), newCastTileData);
    } else {
      saveLayout(view, [], newTiles, undefined, Array.from(castTiles), castTileData);
    }
  }, [tiles, view, castTiles, castTileData, saveLayout, canAddMoreTiles]);

  // Handle casting with subscription check
  const handleCastNow = useCallback(() => {
    if (isFeatureLocked('canCastChromecast')) {
      setLockedFeature('Premium Casting');
      setShowUpgradeModal(true);
      return;
    }
    setShowCastingModal(true);
  }, [isFeatureLocked]);

  if (isLoading) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4">
        <div className="text-center">
          <Loader2 className="w-6 h-6 sm:w-8 sm:h-8 animate-spin text-spotify-green mx-auto mb-4" />
          <p className="text-spotify-text-gray font-spotify text-sm sm:text-base">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  // Show empty state for Stacc Cast when no tiles are cast
  if (view === 'ai-tools' && castTiles.size === 0) {
    return (
      <div className="w-full h-screen flex items-center justify-center p-4">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-spotify-green/20 rounded-full flex items-center justify-center mx-auto mb-4">
            <Cast className="w-8 h-8 text-spotify-green" />
          </div>
          <h2 className="text-2xl font-bold text-spotify-white mb-2 font-spotify">Your Stacc Cast is Empty</h2>
          <p className="text-spotify-text-gray font-spotify mb-6">
            Cast tiles from other pages to build your personalized collection here.
          </p>
          <p className="text-spotify-text-gray text-sm font-spotify mb-8">
            Look for the <Cast className="w-4 h-4 inline mx-1" /> icon on tiles to add them to your Stacc Cast.
          </p>
          
          {/* Add Ghost Tile for Empty State */}
          <div className="max-w-xs mx-auto">
            <GhostTile onAddTile={handleAddTile} />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full min-h-screen bg-spotify-black font-spotify">
      <div className="w-full max-w-full px-2 sm:px-3 lg:px-4 xl:px-6 py-4 sm:py-6 lg:py-8 mx-auto overflow-x-hidden">
        
        {/* HEADER */}
        <div className="mb-4 sm:mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl sm:text-2xl lg:text-3xl font-bold text-spotify-white mb-2 font-spotify">
              {view === 'ai-tools' ? 'Stacc Cast' : 'Your Dashboard'}
            </h2>
            <div className="flex items-center space-x-4">
              <p className="text-spotify-text-gray font-spotify text-sm sm:text-base">
                {view === 'ai-tools' 
                  ? `${castTiles.size} tiles - Bottom 4 tiles locked`
                  : '2 tiles wide on mobile - Bottom 4 tiles locked'
                }
              </p>
              
              {/* Subscription Indicator */}
              <div className="flex items-center space-x-2">
                {subscription.tier === 'free' && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-orange-500/20 rounded-full">
                    <Lock className="w-3 h-3 text-orange-400" />
                    <span className="text-xs text-orange-400 font-spotify">
                      {tiles.length}/{subscription.features.maxTiles} tiles
                    </span>
                  </div>
                )}
                {subscription.tier === 'pro' && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-spotify-green/20 rounded-full">
                    <Crown className="w-3 h-3 text-spotify-green" />
                    <span className="text-xs text-spotify-green font-spotify">Pro</span>
                  </div>
                )}
                {subscription.tier === 'enterprise' && (
                  <div className="flex items-center space-x-1 px-2 py-1 bg-purple-500/20 rounded-full">
                    <Crown className="w-3 h-3 text-purple-400" />
                    <span className="text-xs text-purple-400 font-spotify">Enterprise</span>
                  </div>
                )}
              </div>
            </div>
          </div>
          
          <div className="flex items-center space-x-2 sm:space-x-3">
            {/* Cast Now Button - Only show on Stacc Cast page */}
            {view === 'ai-tools' && castTiles.size > 0 && (
              <div className="relative">
                <button
                  onClick={handleCastNow}
                  className={`flex items-center space-x-2 px-4 sm:px-6 py-3 rounded-full transition-all shadow-lg font-spotify text-sm sm:text-base ${
                    isFeatureLocked('canCastChromecast')
                      ? 'bg-orange-500/20 border border-orange-500/40 text-orange-400 hover:bg-orange-500/30'
                      : 'bg-spotify-green hover:bg-spotify-green-dark text-spotify-black shadow-spotify-green/20 hover:shadow-xl hover:shadow-spotify-green/30 hover:scale-105'
                  }`}
                >
                  {isFeatureLocked('canCastChromecast') && <Lock className="w-4 h-4 sm:w-5 sm:h-5" />}
                  <Tv className="w-4 h-4 sm:w-5 sm:h-5" />
                  <span>{isFeatureLocked('canCastChromecast') ? 'Cast (Pro)' : 'Cast Now'}</span>
                </button>
                
                {isFeatureLocked('canCastChromecast') && (
                  <FeatureLockIndicator
                    feature="Full Casting"
                    requiredTier="pro"
                    inline
                  />
                )}
              </div>
            )}
            
            <button
              onClick={handleResetLayoutClick}
              disabled={isResetting}
              className="flex items-center space-x-2 px-3 sm:px-4 py-2 bg-spotify-light-gray border border-spotify-light-gray rounded-full text-spotify-text-gray hover:text-spotify-white hover:bg-spotify-medium-gray transition-all disabled:opacity-50 disabled:cursor-not-allowed font-spotify text-sm"
            >
              <RotateCcw className={`w-3 h-3 sm:w-4 sm:h-4 ${isResetting ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">
                {view === 'ai-tools' 
                  ? (isResetting ? 'Clearing...' : 'Clear All')
                  : (isResetting ? 'Resetting...' : 'Reset')
                }
              </span>
            </button>
          </div>
        </div>

        {/* Subscription Limit Warning */}
        {checkTileLimit() && subscription.tier === 'free' && (
          <div className="mb-6">
            <FeatureLockIndicator
              feature={`Tile Limit Reached (${tiles.length}/${subscription.features.maxTiles})`}
              requiredTier="pro"
              showUpgradeHint
              onUpgradeClick={() => {
                setLockedFeature('Unlimited Tiles');
                setShowUpgradeModal(true);
              }}
            />
          </div>
        )}

        {/* MOBILE-OPTIMIZED GRID - 2 columns on mobile */}
        <div 
          className={`transition-all duration-500 ${
            isResetting ? 'opacity-50 scale-95' : 'opacity-100 scale-100'
          }`}
          data-grid-container="true"
          onDragLeave={handleDragLeave}
        >
          <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-2 sm:gap-3 lg:gap-4 xl:gap-6">
            {tiles.map((tile, index) => {
              const isDraggedTile = draggedTile === tile.id;
              const isHovering = hoverIndex === index && isDragging && !isDraggedTile;
              const isNonDraggable = isTileNonDraggable(index, tiles.length);
              
              return (
                <div
                  key={tile.id}
                  className={`w-full h-64 sm:h-72 lg:h-80 relative transition-all duration-300 ${
                    isDraggedTile 
                      ? 'opacity-30 scale-95 rotate-2 z-50' 
                      : isHovering 
                        ? 'transform scale-105 shadow-lg shadow-spotify-green/20 z-10' 
                        : 'z-0'
                  } ${
                    isDragging && !isDraggedTile 
                      ? 'transition-transform duration-300 ease-out' 
                      : ''
                  } ${
                    isNonDraggable 
                      ? 'ring-1 ring-orange-500/30 bg-orange-500/5' 
                      : ''
                  }`}
                  draggable={!isNonDraggable}
                  onDragStart={!isNonDraggable ? (e) => handleDragStart(e, tile.id) : undefined}
                  onDragOver={!isNonDraggable ? (e) => handleDragOver(e, index) : undefined}
                  onDragEnter={!isNonDraggable ? (e) => handleDragEnter(e, index) : undefined}
                  onDrop={!isNonDraggable ? (e) => handleDrop(e, index) : undefined}
                  onDragEnd={!isNonDraggable ? handleDragEnd : undefined}
                >
                  {/* Android-style insertion indicator */}
                  {isHovering && !isNonDraggable && (
                    <div className="absolute inset-0 border-2 border-dashed border-spotify-green bg-spotify-green/10 rounded-xl z-10 pointer-events-none animate-pulse" />
                  )}
                  
                  {/* Non-draggable indicator */}
                  {isNonDraggable && (
                    <div className="absolute top-2 right-2 bg-orange-500/80 text-white text-xs px-2 py-1 rounded-full z-30 pointer-events-none font-spotify">
                      🔒 Locked
                    </div>
                  )}
                  
                  <DashboardTile
                    tile={tile}
                    onTileUpdate={handleTileUpdate}
                    onDelete={handleDeleteTile}
                    onCast={handleCastTile}
                    isDeleting={deletingTile === tile.id}
                    isDraggable={!isNonDraggable}
                    isCast={castTiles.has(tile.id)}
                    currentView={view}
                  />
                </div>
              );
            })}
            
            {/* GHOST TILE - Always appears after all tiles, matches height */}
            <div className="w-full h-64 sm:h-72 lg:h-80 relative">
              <GhostTile onAddTile={handleAddTile} />
            </div>
          </div>
        </div>

        {/* INFO SECTION */}
        {view !== 'ai-tools' && (
          <div className="mt-6 sm:mt-8 lg:mt-12 p-3 sm:p-4 lg:p-6 bg-spotify-dark-gray/30 rounded-xl border border-spotify-light-gray/20 w-full max-w-full">
            <div className="text-center">
              <p className="text-spotify-text-gray font-spotify mb-2 text-xs sm:text-sm lg:text-base">
                📱 <strong className="text-spotify-white">Mobile-First:</strong> 2 tiles wide on mobile with responsive scaling
              </p>
              <p className="text-spotify-text-gray text-xs sm:text-sm font-spotify">
                Total tiles: <strong className="text-spotify-green">{tiles.length}</strong> • 
                Cast tiles: <strong className="text-spotify-green">{castTiles.size}</strong> • 
                Draggable: <strong className="text-spotify-green">{Math.max(0, tiles.length - 4)}</strong> • 
                Plan: <strong className="text-spotify-green">{subscription.tier.charAt(0).toUpperCase() + subscription.tier.slice(1)}</strong>
              </p>
            </div>
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <DeleteConfirmationModal
        isOpen={tileToDelete !== null}
        tileName={tiles.find(t => t.id === tileToDelete)?.title || 'this tile'}
        onConfirm={confirmDeleteTile}
        onCancel={cancelDeleteTile}
      />

      {/* Clear All Warning Modal */}
      <WarningModal
        isOpen={showClearAllWarning}
        title="Clear All Cast Tiles"
        message={`Are you sure you want to remove all ${castTiles.size} tiles from your Stacc Cast? This will permanently remove them from your collection, but you can always cast them again from other pages.`}
        actionText="Clear All"
        onConfirm={performResetLayout}
        onCancel={cancelClearAll}
        icon={<Cast className="w-5 h-5 text-orange-400" />}
        isDangerous={true}
      />

      {/* Tile Selection Modal */}
      <TileSelectionModal
        isOpen={showTileSelection}
        onClose={() => setShowTileSelection(false)}
        onSelectTile={handleSelectTile}
        currentView={view}
      />

      {/* Casting Modal - Only show if not locked */}
      {canUseFeature('canCastChromecast') && (
        <CastingModal
          isOpen={showCastingModal}
          onClose={() => setShowCastingModal(false)}
          dashboardContent={{
            tiles: tiles,
            castTiles: Array.from(castTiles),
            view: view,
            timestamp: new Date().toISOString()
          }}
        />
      )}

      {/* Upgrade Modal */}
      <UpgradeModal
        isOpen={showUpgradeModal}
        onClose={() => setShowUpgradeModal(false)}
        lockedFeature={lockedFeature}
        featureDescription={lockedFeature === 'Premium Casting' ? 'Cast to Chromecast and wireless displays' : undefined}
      />
    </div>
  );
};

export default DashboardGrid;