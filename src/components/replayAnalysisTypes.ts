export interface HitLocation {
  frame_index: number;
  player_index: number;
  player_name: string;
  character: string;
  x: number;
  y: number;
  damage_taken: number;
  percent_after_hit: number;
  is_stock_loss: boolean;
  launch_dx: number | null;
  launch_dy: number | null;
}

export interface PerPlayerStats {
  player_index: number;
  player_name: string;
  character: string;
  l_cancel_attempts: number;
  l_cancel_successes: number;
  l_cancel_rate: number;
  tech_attempts: number;
  missed_techs: number;
  tech_miss_rate: number;
  tech_left_count: number;
  tech_right_count: number;
  tech_in_place_count: number;
  actions_per_minute: number;
  ledge_grabs: number;
  wavedashes: number;
  wavelands: number;
  attack_actions: number;
  movement_actions: number;
  openings_won: number;
  kills_secured: number;
  total_damage_inflicted: number;
  punishes_faced: number;
  escaped_punishes: number;
  openings_per_kill: number | null;
  damage_per_opening: number;
  neutral_win_rate: number;
  average_opening_length: number;
  attack_ratio: number;
  movement_ratio: number;
}

export interface AnalysisMetadataPlayer {
  player_index: number;
  character: string;
  tag: string;
  is_cpu: boolean;
  stocks_left: number | null;
  did_win: boolean;
}

export interface AnalysisResponse {
  stats: {
    total_frames: number;
    total_actions: number;
    match_duration_seconds: number;
    hit_locations: HitLocation[];
    per_player: PerPlayerStats[];
  };
  feedback: string[];
  summary: string;
  metadata?: {
    players: AnalysisMetadataPlayer[];
    num_players: number;
    stage?: string;
    winner_player_index?: number | null;
    winner_name?: string | null;
  };
}
