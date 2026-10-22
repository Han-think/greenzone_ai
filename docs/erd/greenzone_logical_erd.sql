-- ERDCloud SQL import: logical relationships, NOT a migration.
-- 논리 ERD: GIS/JSON과 SQLite payload의 업무 관계를 설명한다.
-- 실제 앱은 records/history/seeds 3테이블 + JSON/GeoJSON이다.
-- 이 SQL을 service.sqlite3에 실행하지 않는다.
-- source_id in guide_documents is derived conceptually from source_url.
-- rule_history/document_history are projections of history filtered by kind.
-- Runtime FK constraints are not declared. These FKs describe logical integrity.

CREATE TABLE `district_scopes` (
  `scope_code` VARCHAR(10) NOT NULL COMMENT '관할코드',
  `scope_name` VARCHAR(100) COMMENT '관할명',
  PRIMARY KEY (`scope_code`)
) COMMENT='관할범위';

CREATE TABLE `sources` (
  `source_id` VARCHAR(100) NOT NULL COMMENT '출처ID',
  `title` VARCHAR(255) COMMENT '제목',
  `url` TEXT COMMENT '원문URL',
  `reference_date` DATE COMMENT '자료기준일',
  `checked_at` DATE COMMENT '원문확인일',
  `note` TEXT COMMENT '비고',
  PRIMARY KEY (`source_id`)
) COMMENT='자료출처';

CREATE TABLE `communities` (
  `community_id` INTEGER NOT NULL COMMENT '생활권ID',
  `scope_code` VARCHAR(10) COMMENT '관할코드',
  `registered_units` INTEGER COMMENT '등록주거단위',
  `parcel_count` INTEGER COMMENT '필지수',
  `geometry_json` LONGTEXT COMMENT '경계도형',
  PRIMARY KEY (`community_id`),
  CONSTRAINT fk_relation_01 FOREIGN KEY (scope_code) REFERENCES district_scopes (scope_code)
) COMMENT='생활권';

CREATE TABLE `proposed_hubs` (
  `hub_id` VARCHAR(40) NOT NULL COMMENT '거점ID',
  `community_id` INTEGER COMMENT '생활권ID',
  `hub_name` VARCHAR(255) COMMENT '제안거점명',
  `hub_type` VARCHAR(80) COMMENT '제안유형',
  `longitude` DECIMAL(12, 8) COMMENT '경도',
  `latitude` DECIMAL(12, 8) COMMENT '위도',
  `road_name` VARCHAR(160) COMMENT '접한도로명',
  `road_width_m` DECIMAL(8, 2) COMMENT '도로폭m',
  `road_width_basis` VARCHAR(160) COMMENT '도로폭근거',
  `protection_distance_m` DECIMAL(10, 2) COMMENT '보호시설거리m',
  PRIMARY KEY (`hub_id`),
  UNIQUE (hub_id, community_id),
  CONSTRAINT fk_relation_02 FOREIGN KEY (community_id) REFERENCES communities (community_id)
) COMMENT='제안거점';

CREATE TABLE `residential_parcels` (
  `pnu` CHAR(19) NOT NULL COMMENT '필지고유번호',
  `team_key` CHAR(19) COMMENT '팀필지키',
  `building_name` VARCHAR(500) COMMENT '건물명',
  `address` VARCHAR(500) COMMENT '도로명주소',
  `jibun_address` VARCHAR(255) COMMENT '지번주소',
  `longitude` DECIMAL(12, 8) COMMENT '경도',
  `latitude` DECIMAL(12, 8) COMMENT '위도',
  `registered_units` INTEGER COMMENT '등록주거단위',
  `housing_type` VARCHAR(100) COMMENT '주택유형',
  `community_id` INTEGER COMMENT '생활권ID',
  `hub_id` VARCHAR(40) COMMENT '거점ID',
  PRIMARY KEY (`pnu`),
  CONSTRAINT fk_relation_03 FOREIGN KEY (community_id) REFERENCES communities (community_id),
  CONSTRAINT fk_relation_04 FOREIGN KEY (hub_id, community_id) REFERENCES proposed_hubs (hub_id, community_id)
) COMMENT='주거필지';

CREATE TABLE `waste_items` (
  `item_id` VARCHAR(100) NOT NULL COMMENT '품목ID',
  `official_name` VARCHAR(255) COMMENT '공식품목명',
  `category` VARCHAR(80) COMMENT '품목구분',
  `official_category` VARCHAR(100) COMMENT '공식분류',
  `source_id` VARCHAR(100) COMMENT '출처ID',
  `active` BOOLEAN COMMENT '사용여부',
  PRIMARY KEY (`item_id`),
  CONSTRAINT fk_relation_05 FOREIGN KEY (source_id) REFERENCES sources (source_id)
) COMMENT='폐기물품목';

CREATE TABLE `item_aliases` (
  `alias_id` VARCHAR(100) NOT NULL COMMENT '별칭ID',
  `item_id` VARCHAR(100) COMMENT '품목ID',
  `alias` VARCHAR(255) COMMENT '검색별칭',
  `origin` VARCHAR(80) COMMENT '별칭출처',
  PRIMARY KEY (`alias_id`),
  CONSTRAINT fk_relation_06 FOREIGN KEY (item_id) REFERENCES waste_items (item_id)
) COMMENT='품목별칭';

CREATE TABLE `item_rules` (
  `rule_id` VARCHAR(100) NOT NULL COMMENT '규칙ID',
  `item_id` VARCHAR(100) COMMENT '품목ID',
  `scope_code` VARCHAR(10) COMMENT '관할코드',
  `specification` VARCHAR(500) COMMENT '규격',
  `fee_krw` INTEGER COMMENT '참고수수료원',
  `fee_status` VARCHAR(100) COMMENT '금액상태',
  `collection_status` VARCHAR(160) COMMENT '수거상태',
  `housing_type` VARCHAR(100) COMMENT '주택유형',
  `conditions` TEXT COMMENT '적용조건',
  `source_id` VARCHAR(100) COMMENT '출처ID',
  `guide_source_id` VARCHAR(100) COMMENT '절차출처ID',
  `checked_at` DATE COMMENT '원문확인일',
  `reference_date` DATE COMMENT '자료기준일',
  `effective_from` DATE COMMENT '시행시작일',
  `effective_until` DATE COMMENT '시행종료일',
  `verification_status` VARCHAR(100) COMMENT '검토상태',
  `active` BOOLEAN COMMENT '사용여부',
  `snapshot_id` VARCHAR(100) COMMENT '스냅샷ID',
  PRIMARY KEY (`rule_id`),
  CONSTRAINT fk_relation_07 FOREIGN KEY (item_id) REFERENCES waste_items (item_id),
  CONSTRAINT fk_relation_08 FOREIGN KEY (scope_code) REFERENCES district_scopes (scope_code),
  CONSTRAINT fk_relation_09 FOREIGN KEY (source_id) REFERENCES sources (source_id),
  CONSTRAINT fk_relation_10 FOREIGN KEY (guide_source_id) REFERENCES sources (source_id)
) COMMENT='품목규격_수수료';

CREATE TABLE `guide_documents` (
  `document_id` VARCHAR(100) NOT NULL COMMENT '문서ID',
  `scope_code` VARCHAR(10) COMMENT '관할코드',
  `title` VARCHAR(500) COMMENT '제목',
  `content_text` LONGTEXT COMMENT '근거본문',
  `source_url` TEXT COMMENT '원문URL',
  `source_type` VARCHAR(100) COMMENT '근거종류',
  `checked_at` DATE COMMENT '원문확인일',
  `reference_date` DATE COMMENT '자료기준일',
  `effective_from` DATE COMMENT '시행시작일',
  `effective_until` DATE COMMENT '시행종료일',
  `verification_status` VARCHAR(100) COMMENT '검토상태',
  `active` BOOLEAN COMMENT '사용여부',
  `source_id` VARCHAR(100) COMMENT '출처ID(원문URL의 논리 연결)',
  PRIMARY KEY (`document_id`),
  CONSTRAINT fk_relation_11 FOREIGN KEY (scope_code) REFERENCES district_scopes (scope_code),
  CONSTRAINT fk_relation_12 FOREIGN KEY (source_id) REFERENCES sources (source_id)
) COMMENT='배출근거문서';

CREATE TABLE `rule_history` (
  `history_id` INTEGER NOT NULL COMMENT '이력ID',
  `rule_id` VARCHAR(191) COMMENT '규칙ID',
  `actor` VARCHAR(100) COMMENT '수정계정',
  `reason` TEXT COMMENT '수정사유',
  `before_json` LONGTEXT COMMENT '이전값',
  `after_json` LONGTEXT COMMENT '새값',
  `changed_at` VARCHAR(40) COMMENT '수정시각',
  PRIMARY KEY (`history_id`),
  CONSTRAINT fk_relation_13 FOREIGN KEY (rule_id) REFERENCES item_rules (rule_id)
) COMMENT='규칙수정이력 (history의 kind별 논리 표현)';

CREATE TABLE `document_history` (
  `history_id` INTEGER NOT NULL COMMENT '이력ID',
  `document_id` VARCHAR(191) COMMENT '문서ID',
  `actor` VARCHAR(100) COMMENT '수정계정',
  `reason` TEXT COMMENT '수정사유',
  `before_json` LONGTEXT COMMENT '이전값',
  `after_json` LONGTEXT COMMENT '새값',
  `changed_at` VARCHAR(40) COMMENT '수정시각',
  PRIMARY KEY (`history_id`),
  CONSTRAINT fk_relation_14 FOREIGN KEY (document_id) REFERENCES guide_documents (document_id)
) COMMENT='문서수정이력 (history의 kind별 논리 표현)';
