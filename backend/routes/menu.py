"""
Menu routes - public and admin endpoints
"""

from fastapi import APIRouter, HTTPException, status, Depends, Query
from typing import Optional, Dict, Any

from middleware import auth_required
from middleware.admin_auth import admin_required
from schemas.menu import (
    MenuItemCreate, MenuItemUpdate,
    MenuItemResponse, MenuListResponse
)
from services import menu_service

router = APIRouter()


@router.get("", response_model=MenuListResponse)
async def get_menu(
    category: Optional[str] = Query(None, description="Filter by category"),
    available_only: bool = Query(False, description="Show only available items"),
    page: int = Query(1, ge=1),
    per_page: int = Query(50, ge=1, le=100)
):
    """Get all menu items with optional filtering"""
    result = await menu_service.get_all_items(
        category=category,
        available_only=available_only,
        page=page,
        per_page=per_page
    )
    
    return MenuListResponse(
        items=[MenuItemResponse(**item) for item in result["items"]],
        total=result["total"],
        categories=result["categories"]
    )


@router.get("/category/{category}")
async def get_menu_by_category(category: str):
    """Get menu items by category"""
    result = await menu_service.get_all_items(category=category, per_page=100)
    
    return {
        "success": True,
        "category": category,
        "items": result["items"],
        "total": result["total"]
    }


@router.get("/{item_id}", response_model=MenuItemResponse)
async def get_menu_item(item_id: str):
    """Get a single menu item by ID"""
    item = await menu_service.get_item_by_id(item_id)
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )
    
    return MenuItemResponse(**item)


@router.get("/slug/{slug}", response_model=MenuItemResponse)
async def get_menu_item_by_slug(slug: str):
    """Get a single menu item by slug"""
    item = await menu_service.get_item_by_slug(slug)
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )
    
    return MenuItemResponse(**item)


@router.get("/search/{query}")
async def search_menu(query: str):
    """Search menu items by name or description"""
    items = await menu_service.search_items(query)
    
    return {
        "success": True,
        "query": query,
        "items": items,
        "total": len(items)
    }


# ========== ADMIN ROUTES ==========

@router.post("", response_model=MenuItemResponse, status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    request: MenuItemCreate,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Create a new menu item (admin only)"""
    item_data = request.model_dump()
    item = await menu_service.create_item(item_data)
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Failed to create menu item"
        )
    
    return MenuItemResponse(**item)


@router.put("/{item_id}", response_model=MenuItemResponse)
async def update_menu_item(
    item_id: str,
    request: MenuItemUpdate,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Update a menu item (admin only)"""
    update_data = request.model_dump(exclude_unset=True)
    item = await menu_service.update_item(item_id, update_data)
    
    if not item:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found or update failed"
        )
    
    return MenuItemResponse(**item)


@router.delete("/{item_id}")
async def delete_menu_item(
    item_id: str,
    payload: Dict[str, Any] = Depends(admin_required)
):
    """Delete a menu item (admin only)"""
    success = await menu_service.delete_item(item_id)
    
    if not success:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Menu item not found"
        )
    
    return {
        "success": True,
        "message": "Menu item deleted successfully"
    }
