"""Validated request models for the analysis endpoints."""
from __future__ import annotations

import math
from typing import Literal

from pydantic import BaseModel, Field, field_validator, model_validator


class LocationIn(BaseModel):
    lat: float = Field(..., ge=-90, le=90)
    lon: float = Field(..., ge=-180, le=180)
    altitude: float | None = None
    name: str | None = None
    utc_offset: float = Field(5.5, ge=-12, le=14)


class WeatherIn(BaseModel):
    source: Literal["pvgis_tmy", "pvgis_year", "clearsky", "upload"] = "pvgis_tmy"
    year: int | None = Field(None, ge=1900, le=2100)
    upload_id: str | None = None


class PanelIn(BaseModel):
    id: str | None = None
    model: str | None = None
    pmpp_w: float = Field(..., gt=0)
    gamma_pmp: float = Field(-0.0026, ge=-0.02, le=0.005)
    bifaciality: float = Field(0.0, ge=0.0, le=1.2)
    length_m: float = Field(2.382, gt=0)
    width_m: float = Field(1.134, gt=0)


class Losses(BaseModel):
    soiling: float = Field(2.0, ge=0, le=100)
    shading: float = Field(0.0, ge=0, le=100)
    snow: float = Field(0.0, ge=0, le=100)
    mismatch: float = Field(2.0, ge=0, le=100)
    wiring: float = Field(2.0, ge=0, le=100)
    connections: float = Field(0.5, ge=0, le=100)
    lid: float = Field(1.5, ge=0, le=100)
    nameplate_rating: float = Field(1.0, ge=0, le=100)
    age: float = Field(0.0, ge=0, le=100)
    availability: float = Field(3.0, ge=0, le=100)


class PlantIn(BaseModel):
    dc_mw: float = Field(..., gt=0)
    ac_mw: float = Field(..., gt=0)
    inverter_id: str | None = None
    eta_inv_nom: float = Field(0.988, gt=0, le=1)
    albedo: float = Field(0.20, ge=0, le=1)
    gcr: float = Field(0.40, gt=0.05, le=0.95)
    height_m: float = Field(1.5, ge=0)
    modules_per_row: int = Field(1, ge=1)
    orientation: Literal["portrait", "landscape"] = "portrait"
    bifacial: bool = True
    temp_model: Literal["faiman", "pvsyst", "sapm_open", "sapm_close"] = "faiman"
    dc_model: Literal["pvwatts", "detailed"] = "pvwatts"
    mounting: Literal["fixed", "sat"] = "fixed"
    axis_azimuth: float = Field(0.0, ge=0, le=360)      # tracker axis bearing (0 = N-S)
    max_angle: float = Field(60.0, ge=5, le=90)         # tracker max rotation
    backtrack: bool = True
    apply_horizon: bool = False                         # far-shading from PVGIS horizon
    design_temp_min_c: float | None = Field(None, ge=-40, le=80)
    design_temp_max_cell_c: float | None = Field(None, ge=25, le=110)
    inverter_count: int | None = Field(None, ge=1, le=5000)
    transformer_count: int | None = Field(None, ge=1, le=100)
    transformer_pf: float = Field(0.95, ge=0.80, le=1.0)
    harmonic_tdd_pct: float | None = Field(3.0, ge=0.0, le=100.0)
    losses: Losses = Losses()

    @model_validator(mode="after")
    def _check_design_temperatures(self):
        if (
            self.design_temp_min_c is not None
            and self.design_temp_max_cell_c is not None
            and self.design_temp_max_cell_c <= self.design_temp_min_c
        ):
            raise ValueError("design_temp_max_cell_c must be higher than design_temp_min_c")
        return self


class SweepIn(BaseModel):
    tilt_min: float = Field(1.0, ge=1, le=90)
    tilt_max: float = Field(45.0, ge=0, le=90)
    tilt_step: float = Field(2.0, gt=0, le=90)
    az_min: float = Field(1.0, ge=1, le=360)
    az_max: float = Field(360.0, ge=1, le=360)
    az_step: float = Field(5.0, gt=0, le=360)

    @model_validator(mode="after")
    def validate_ranges(self):
        if self.tilt_max < self.tilt_min:
            raise ValueError("tilt_max must be greater than or equal to tilt_min")
        if self.az_max < self.az_min:
            raise ValueError("az_max must be greater than or equal to az_min")
        combinations = (
            (int((self.tilt_max - self.tilt_min) / self.tilt_step) + 1)
            * (int((self.az_max - self.az_min) / self.az_step) + 1)
        )
        if combinations > 5000:
            raise ValueError("Sweep is limited to 5,000 tilt/azimuth combinations")
        return self


class SelectedIn(BaseModel):
    tilt: float | None = Field(None, ge=0, le=90)
    azimuth: float | None = Field(None, ge=0, le=360)


class AnalyzeRequest(BaseModel):
    location: LocationIn
    weather: WeatherIn = WeatherIn()
    panel: PanelIn
    plant: PlantIn
    sweep: SweepIn = SweepIn()
    selected: SelectedIn = SelectedIn()
    # "optimize": sweep tilt x azimuth and report the optimum.
    # "manual"  : evaluate the full analysis at the user-specified selected
    #             tilt/azimuth (PVsyst-style fixed-orientation run).
    mode: Literal["optimize", "manual"] = "optimize"

    @model_validator(mode="after")
    def _manual_needs_angles(self):
        if self.mode == "manual" and (self.selected.tilt is None or self.selected.azimuth is None):
            raise ValueError("Manual mode requires selected.tilt and selected.azimuth")
        return self


class InspectRequest(BaseModel):
    location: LocationIn
    weather: WeatherIn = WeatherIn()


class EvaluateRequest(BaseModel):
    """Single-orientation evaluation for the orientation explorer."""
    location: LocationIn
    weather: WeatherIn = WeatherIn()
    panel: PanelIn
    plant: PlantIn
    tilt: float = Field(..., ge=0, le=90)
    azimuth: float = Field(..., ge=0, le=360)


class LongTermRequest(BaseModel):
    location: LocationIn
    panel: PanelIn
    plant: PlantIn
    tilt: float = Field(..., ge=0, le=90)
    azimuth: float = Field(180.0, ge=0, le=360)
    start_year: int = Field(2005, ge=1990, le=2030)
    end_year: int = Field(2020, ge=1990, le=2030)
    model_uncertainty: float = Field(0.04, ge=0, le=0.3)     # fraction
    lifetime_years: int = Field(25, ge=1, le=40)
    lid: float = Field(1.0, ge=0, le=10)                     # first-year %
    degradation_rate: float = Field(0.35, ge=0, le=5)        # %/yr after year 1
    availability: float = Field(99.0, ge=50, le=100)         # %

    @model_validator(mode="after")
    def _check_years(self):
        if self.end_year < self.start_year:
            raise ValueError("end_year must be ≥ start_year")
        if self.end_year - self.start_year < 4:
            raise ValueError("Use at least five historical years")
        if self.end_year - self.start_year > 30:
            raise ValueError("Limit the analysis span to 30 years")
        return self


class EastWestPlaneIn(BaseModel):
    """One fixed PV plane in a dual-plane East-West arrangement."""

    label: str = "Plane"
    tilt: float = Field(10.0, ge=0, le=90)
    azimuth: float = 90.0
    dc_share: float = Field(50.0, gt=0, lt=100)

    @field_validator("azimuth", mode="before")
    @classmethod
    def _wrap_azimuth(cls, value):
        az = float(value)
        if not math.isfinite(az):
            raise ValueError("azimuth must be a finite number")
        return az % 360.0


class EastWestSearchIn(BaseModel):
    """Search controls for the dual-plane optimizer.

    Symmetric mode uses common_tilt_* and east_az_*; the west plane is east+180.
    Independent mode uses a_* and b_* ranges and combines only the best coarse
    candidates before a deterministic local refinement.
    """

    common_tilt_min: float = Field(1.0, ge=0, le=90)
    common_tilt_max: float = Field(45.0, ge=0, le=90)
    common_tilt_step: float = Field(2.0, gt=0, le=30)
    east_az_min: float = 45.0
    east_az_max: float = 135.0
    east_az_step: float = Field(5.0, gt=0, le=90)
    split_min_pct: float = Field(50.0, ge=1, le=99)
    split_max_pct: float = Field(50.0, ge=1, le=99)
    split_step_pct: float = Field(5.0, gt=0, le=50)

    a_tilt_min: float = Field(1.0, ge=0, le=90)
    a_tilt_max: float = Field(45.0, ge=0, le=90)
    a_tilt_step: float = Field(5.0, gt=0, le=45)
    a_az_min: float = 45.0
    a_az_max: float = 180.0
    a_az_step: float = Field(10.0, gt=0, le=180)

    b_tilt_min: float = Field(1.0, ge=0, le=90)
    b_tilt_max: float = Field(45.0, ge=0, le=90)
    b_tilt_step: float = Field(5.0, gt=0, le=45)
    b_az_min: float = 180.0
    b_az_max: float = 315.0
    b_az_step: float = Field(10.0, gt=0, le=180)

    top_plane_count: int = Field(10, ge=3, le=40)
    exact_rerank_count: int = Field(25, ge=5, le=100)

    @field_validator("east_az_min", "east_az_max", "a_az_min", "a_az_max", "b_az_min", "b_az_max", mode="before")
    @classmethod
    def _validate_search_azimuth(cls, value):
        az = float(value)
        if not math.isfinite(az):
            raise ValueError("azimuth ranges must be finite numbers")
        if az < 0.0 or az > 360.0:
            raise ValueError("azimuth search ranges must be between 0 and 360")
        return az

    @model_validator(mode="after")
    def _validate_ranges(self):
        def axis_count(a, b, step, label):
            if b < a:
                raise ValueError(f"{label}_max must be greater than or equal to {label}_min")
            return int(math.floor((b - a) / step + 1e-9)) + 1

        n_t = axis_count(self.common_tilt_min, self.common_tilt_max, self.common_tilt_step, "common_tilt")
        n_a = axis_count(self.east_az_min, self.east_az_max, self.east_az_step, "east_az")
        n_s = axis_count(self.split_min_pct, self.split_max_pct, self.split_step_pct, "split")
        if n_t * n_a * n_s > 20000:
            raise ValueError("Symmetric East-West search is limited to 20,000 candidate combinations")

        n_at = axis_count(self.a_tilt_min, self.a_tilt_max, self.a_tilt_step, "a_tilt")
        n_aa = axis_count(self.a_az_min, self.a_az_max, self.a_az_step, "a_az")
        n_bt = axis_count(self.b_tilt_min, self.b_tilt_max, self.b_tilt_step, "b_tilt")
        n_ba = axis_count(self.b_az_min, self.b_az_max, self.b_az_step, "b_az")
        if n_at * n_aa > 2500 or n_bt * n_ba > 2500:
            raise ValueError("Independent East-West plane grids are limited to 2,500 orientations per plane")
        if self.split_max_pct < self.split_min_pct:
            raise ValueError("split_max_pct must be greater than or equal to split_min_pct")
        return self


class EastWestOverloadRequest(BaseModel):
    """Inverter-overload (DC/AC ratio) sweep at fixed AC nameplate."""
    location: LocationIn
    weather: WeatherIn = WeatherIn()
    panel: PanelIn
    plant: PlantIn
    inverter_arrangement: Literal["shared", "separate"] = "shared"
    plane_a: EastWestPlaneIn
    plane_b: EastWestPlaneIn
    single_ref_tilt: float | None = Field(None, ge=0, le=90)
    single_ref_azimuth: float | None = Field(None, ge=0, le=360)
    ilr_min: float = Field(1.0, ge=0.8, le=2.0)
    ilr_max: float = Field(1.6, ge=0.8, le=2.0)
    ilr_step: float = Field(0.05, gt=0.005, le=0.5)
    clip_threshold_pct: float = Field(2.0, ge=0.1, le=20.0)

    @model_validator(mode="after")
    def _check(self):
        if self.ilr_max < self.ilr_min:
            raise ValueError("ilr_max must be ≥ ilr_min")
        if (self.ilr_max - self.ilr_min) / self.ilr_step > 200:
            raise ValueError("ILR sweep is limited to 200 points")
        total = self.plane_a.dc_share + self.plane_b.dc_share
        if abs(total - 100.0) > 0.001:
            raise ValueError("plane_a.dc_share + plane_b.dc_share must equal 100")
        return self


class EastWestAnalyzeRequest(BaseModel):
    location: LocationIn
    weather: WeatherIn = WeatherIn()
    panel: PanelIn
    plant: PlantIn
    mode: Literal["optimize", "manual"] = "optimize"
    arrangement: Literal["symmetric", "independent"] = "symmetric"
    inverter_arrangement: Literal["shared", "separate"] = "shared"
    optimize_split: bool = False
    plane_a: EastWestPlaneIn | None = None
    plane_b: EastWestPlaneIn | None = None
    search: EastWestSearchIn = EastWestSearchIn()
    single_plane_sweep: SweepIn = SweepIn(tilt_min=1, tilt_max=45, tilt_step=5, az_min=1, az_max=360, az_step=5)

    @model_validator(mode="after")
    def _validate_planes(self):
        if self.mode == "manual":
            if self.plane_a is None or self.plane_b is None:
                raise ValueError("Manual East-West mode requires plane_a and plane_b")
            total = self.plane_a.dc_share + self.plane_b.dc_share
            if abs(total - 100.0) > 0.001:
                raise ValueError("plane_a.dc_share + plane_b.dc_share must equal 100")
        if self.mode == "optimize" and self.arrangement == "symmetric" and not self.optimize_split:
            object.__setattr__(self.search, "split_min_pct", 50.0)
            object.__setattr__(self.search, "split_max_pct", 50.0)
        return self
